/**
 * Shared summarization utility for large tool results.
 * For Agent mode: Uses Claude Haiku for fast, cost-effective summarization.
 * For Chat mode: Uses the current model from the session.
 */

import Anthropic from '@anthropic-ai/sdk';
import { SUMMARIZATION_MODEL } from '../config/models.ts';
import { resolveModelId } from '../config/storage.ts';
import { debug } from './debug.ts';
import { getCredentialManager } from '../credentials/index.ts';

// Token limit for summarization trigger (roughly ~60KB of text)
export const TOKEN_LIMIT = 15000;

// Max tokens to send to Haiku for summarization (~400KB, Haiku handles this quickly)
const MAX_SUMMARIZATION_INPUT = 100000;

// Lazy-initialized Anthropic client for summarization.
// Must be reset via resetSummarizationClient() when auth/provider settings change.
let anthropicClient: Anthropic | null = null;

/**
 * Reset the cached summarization client.
 * Call this when auth or provider settings change so the next summarization
 * picks up the new credentials/base URL.
 */
export function resetSummarizationClient(): void {
  anthropicClient = null;
}

/**
 * Get or create Anthropic client for summarization.
 * Supports auth types: api_key and oauth_token.
 */
async function getAnthropicClient(): Promise<Anthropic | null> {
  if (anthropicClient) {
    return anthropicClient;
  }

  // Option 1: Direct API key from env (set by reinitializeAuth in sessions.ts)
  const envApiKey = process.env.ANTHROPIC_API_KEY;
  if (envApiKey) {
    const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
    anthropicClient = new Anthropic({
      apiKey: envApiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {})
    });
    debug('[summarize] Using ANTHROPIC_API_KEY for summarization');
    return anthropicClient;
  }

  // Option 2: Claude Max OAuth token
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
    anthropicClient = new Anthropic({
      apiKey: oauthToken,
      ...(baseUrl ? { baseURL: baseUrl } : {})
    });
    debug('[summarize] Using CLAUDE_CODE_OAUTH_TOKEN for summarization');
    return anthropicClient;
  }

  // Fallback: try credential manager (for cases where env vars aren't set yet)
  const manager = getCredentialManager();
  const apiKey = await manager.getApiKey();
  if (apiKey) {
    const baseUrl = process.env.ANTHROPIC_BASE_URL?.trim();
    anthropicClient = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {})
    });
    debug('[summarize] Using API key from credential manager for summarization');
    return anthropicClient;
  }

  debug('[summarize] No auth available - summarization will use truncation fallback');
  return null;
}

/**
 * Estimate token count from text length (rough approximation: 4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Context for summarization - helps the model extract relevant information
 */
export interface SummarizationContext {
  /** Tool or API name */
  toolName: string;
  /** Optional endpoint/path for API calls */
  path?: string;
  /** Tool input parameters */
  input?: Record<string, unknown>;
  /** The model's stated intent/reasoning before calling the tool (most specific) */
  modelIntent?: string;
  /** The user's original request (fallback context) */
  userRequest?: string;
  /** Optional: Model to use for summarization (for Chat mode). If not provided, uses Claude Haiku. */
  model?: string;
  /** Optional: OpenRouter API key (for Chat mode with OpenRouter models) */
  openRouterApiKey?: string;
}

/**
 * Summarize a large tool result to fit within context limits.
 * Agent mode: Uses Claude Haiku for fast, cheap summarization.
 * Chat mode: Uses the current model from context.model.
 *
 * @param response - The large response text to summarize
 * @param context - Context about the tool/API call for better summarization
 * @returns Summarized response, or truncated fallback on error
 */
export async function summarizeLargeResult(
  response: string,
  context: SummarizationContext
): Promise<string> {
  // Chat mode: Use OpenRouter if model is provided
  if (context.model && context.openRouterApiKey) {
    return summarizeWithOpenRouter(response, context);
  }

  // Agent mode: Use Claude (default behavior)
  const client = await getAnthropicClient();

  // If no client (no API key), fall back to truncation
  if (!client) {
    debug('[summarize] Falling back to truncation (no API key for summarization)');
    return response.substring(0, 40000) + '\n\n[Result truncated due to size - smart summarization requires API key auth]';
  }

  // Build context from tool input (safely stringify to handle cyclic structures)
  let inputContext = 'No specific parameters provided.';
  if (context.input) {
    try {
      inputContext = `Request parameters: ${JSON.stringify(context.input)}`;
    } catch (e) {
      // Log the error with context to help debug where cyclic structures originate
      debug(`[summarize] CYCLIC STRUCTURE DETECTED in context.input for tool ${context.toolName}`);
      debug(`[summarize] Input keys: ${Object.keys(context.input).join(', ')}`);
      debug(`[summarize] Error: ${e}`);
      inputContext = 'Request parameters: [non-serializable input - contains cyclic references]';
    }
  }

  const endpointContext = context.path
    ? `Endpoint: ${context.path}`
    : '';

  // Build intent context - prefer model's stated intent, fall back to user request
  const intentContext = context.modelIntent
    ? `The AI assistant's goal: "${context.modelIntent.slice(-500)}"`
    : context.userRequest
      ? `User's original request: "${context.userRequest.slice(0, 300)}"`
      : '';

  // Truncate response to fit within Haiku's context safely
  const maxChars = MAX_SUMMARIZATION_INPUT * 4; // ~400KB
  const truncatedResponse = response.length > maxChars
    ? response.substring(0, maxChars) + '\n\n[... truncated for summarization ...]'
    : response;
  const wasTruncated = response.length > maxChars;

  try {
    const result = await client.messages.create({
      model: resolveModelId(SUMMARIZATION_MODEL),
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: `You are summarizing a tool result that was too large to fit in context.

Tool: ${context.toolName}
${endpointContext}
${inputContext}
${intentContext ? `\n${intentContext}` : ''}
${wasTruncated ? '\nNote: The response was truncated before summarization due to extreme size.' : ''}

Your task:
1. Extract the MOST RELEVANT information based on the stated goal or request above
2. Preserve key data points, IDs, URLs, and actionable information that relate to the goal
3. Summarize long text content but keep essential details needed to complete the task
4. Format the output cleanly for the AI assistant to use

Tool result to summarize:
${truncatedResponse}

Provide a concise but comprehensive summary that captures the essential information needed to accomplish the stated goal.`
      }]
    });

    const textBlock = result.content.find(b => b.type === 'text');
    return textBlock?.text || 'Failed to summarize result';
  } catch (error) {
    debug(`[summarize] Summarization failed: ${error}`);
    // Fall back to truncation if summarization fails
    return response.substring(0, 40000) + '\n\n[Result truncated due to size]';
  }
}

/**
 * Summarize using OpenRouter (for Chat mode)
 */
async function summarizeWithOpenRouter(
  response: string,
  context: SummarizationContext
): Promise<string> {
  const { model, openRouterApiKey } = context;
  if (!model || !openRouterApiKey) {
    debug('[summarize] Missing model or API key for OpenRouter summarization');
    return response.substring(0, 40000) + '\n\n[Result truncated due to size]';
  }

  // Build context
  let inputContext = 'No specific parameters provided.';
  if (context.input) {
    try {
      inputContext = `Request parameters: ${JSON.stringify(context.input)}`;
    } catch {
      inputContext = 'Request parameters: [non-serializable input]';
    }
  }

  const endpointContext = context.path ? `Endpoint: ${context.path}` : '';
  const intentContext = context.modelIntent
    ? `The AI assistant's goal: "${context.modelIntent.slice(-500)}"`
    : context.userRequest
      ? `User's original request: "${context.userRequest.slice(0, 300)}"`
      : '';

  // Truncate response
  const maxChars = MAX_SUMMARIZATION_INPUT * 4;
  const truncatedResponse = response.length > maxChars
    ? response.substring(0, maxChars) + '\n\n[... truncated for summarization ...]'
    : response;
  const wasTruncated = response.length > maxChars;

  const prompt = `You are summarizing a tool result that was too large to fit in context.

Tool: ${context.toolName}
${endpointContext}
${inputContext}
${intentContext ? `\n${intentContext}` : ''}
${wasTruncated ? '\nNote: The response was truncated before summarization due to extreme size.' : ''}

Your task:
1. Extract the MOST RELEVANT information based on the stated goal or request above
2. Preserve key data points, IDs, URLs, and actionable information that relate to the goal
3. Summarize long text content but keep essential details needed to complete the task
4. Format the output cleanly for the AI assistant to use

Tool result to summarize:
${truncatedResponse}

Provide a concise but comprehensive summary that captures the essential information needed to accomplish the stated goal.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterApiKey}`,
        'HTTP-Referer': 'https://craft-agents.app',
        'X-Title': 'Craft Agents',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      debug(`[summarize] OpenRouter summarization failed: ${response.status} ${errorText}`);
      return truncatedResponse.substring(0, 40000) + '\n\n[Result truncated due to size]';
    }

    const data = await response.json() as any;
    const summary = data.choices?.[0]?.message?.content;
    if (summary && typeof summary === 'string') {
      debug(`[summarize] Successfully summarized with ${model}`);
      return summary;
    }

    debug('[summarize] OpenRouter response missing content');
    return truncatedResponse.substring(0, 40000) + '\n\n[Result truncated due to size]';
  } catch (error) {
    debug(`[summarize] OpenRouter summarization error: ${error}`);
    return truncatedResponse.substring(0, 40000) + '\n\n[Result truncated due to size]';
  }
}
