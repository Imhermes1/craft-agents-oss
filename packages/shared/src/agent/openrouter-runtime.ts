/**
 * OpenRouter Runtime
 *
 * Alternative agent runtime that uses OpenRouter API with OpenAI-format messages.
 * Provides 3-strike tool call escalation to Claude SDK when tool calls fail.
 */

import type { AgentEvent } from '@craft-agent/core/types'
import type { Workspace } from '../config/storage.ts'
import type { SessionConfig as Session } from '../sessions/storage.ts'
import type { ThinkingLevel } from './thinking-levels.ts'
import type { PermissionMode } from './mode-manager.ts'
import type { LoadedSource } from '../sources/types.ts'
import { getCredentialManager } from '../credentials/index.ts'
import { CraftAgent, type RecoveryMessage } from './craft-agent.ts'
import { getPermissionMode } from './mode-manager.ts'

export interface OpenRouterRuntimeConfig {
  workspace: Workspace
  session?: Session
  model?: string
  thinkingLevel?: ThinkingLevel
  onSdkSessionIdUpdate?: (id: string) => void
  getRecoveryMessages?: () => RecoveryMessage[]
  isHeadless?: boolean
  onEscalationNeeded?: (toolName: string, attempts: number) => Promise<boolean>
}

export interface SendMessageOptions {
  message: string
  signal?: AbortSignal
}

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string; [key: string]: any }>
}

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenRouterChoice {
  message: {
    role: 'assistant'
    content?: string
    tool_calls?: OpenRouterToolCall[]
  }
  finish_reason: string
}

interface OpenRouterResponse {
  id: string
  choices: OpenRouterChoice[]
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export class OpenRouterRuntime {
  private workspace: Workspace
  private session?: Session
  private model: string
  private thinkingLevel: ThinkingLevel
  private onEscalationNeeded?: (toolName: string, attempts: number) => Promise<boolean>
  private claudeFallback: CraftAgent | null = null
  private toolCallAttempts: Map<string, number> = new Map()
  private conversationHistory: OpenRouterMessage[] = []
  private allSources: LoadedSource[] = []

  constructor(config: OpenRouterRuntimeConfig) {
    this.workspace = config.workspace
    this.session = config.session
    this.model = config.model || 'openai/gpt-4o'
    this.thinkingLevel = config.thinkingLevel || 'think'
    this.onEscalationNeeded = config.onEscalationNeeded
  }

  /**
   * Set all available sources for context
   */
  setAllSources(sources: LoadedSource[]) {
    this.allSources = sources
  }

  /**
   * Send a message and get streaming response
   */
  async *sendMessage(
    content: string,
    options: SendMessageOptions
  ): AsyncGenerator<AgentEvent> {
    // Add user message to history
    this.conversationHistory.push({
      role: 'user',
      content,
    })

    // Call OpenRouter API
    const apiKey = await this.getApiKey()
    if (!apiKey) {
      yield {
        type: 'error',
        error: 'No OpenRouter API key configured. Please add your API key in Settings.',
      }
      return
    }

    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        const response = await this.callOpenRouter(apiKey, options.signal)

        if (!response.choices?.[0]?.message) {
          throw new Error('Invalid response from OpenRouter')
        }

        const assistantMessage = response.choices[0].message

        // Handle tool calls
        if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
          for (const toolCall of assistantMessage.tool_calls) {
            const toolName = toolCall.function.name
            const toolInput = JSON.parse(toolCall.function.arguments)

            yield {
              type: 'tool_start',
              toolUseId: toolCall.id,
              toolName,
              toolInput,
            }

            try {
              // TODO: Execute tool call
              // This will need to integrate with the existing tool execution system
              const result = await this.executeToolCall(toolName, toolInput)

              yield {
                type: 'tool_result',
                toolUseId: toolCall.id,
                toolName,
                result,
              }

              this.toolCallAttempts.delete(toolCall.id)
            } catch (error) {
              // Track failures
              const attempts = (this.toolCallAttempts.get(toolCall.id) || 0) + 1
              this.toolCallAttempts.set(toolCall.id, attempts)

              if (attempts >= 3) {
                // Escalate to Claude
                const shouldEscalate = await this.requestEscalation(toolName)
                if (shouldEscalate) {
                  const escalatedResult = await this.escalateToolCall(toolName, toolInput)
                  yield {
                    type: 'tool_result',
                    toolUseId: toolCall.id,
                    toolName,
                    result: escalatedResult,
                    escalated: true,
                  }
                  this.toolCallAttempts.delete(toolCall.id)
                  continue
                }
              }

              yield {
                type: 'tool_error',
                toolUseId: toolCall.id,
                toolName,
                error: error instanceof Error ? error.message : String(error),
              }
            }
          }
        }

        // Handle text response
        if (assistantMessage.content) {
          yield {
            type: 'text',
            text: assistantMessage.content,
          }

          // Add to conversation history
          this.conversationHistory.push(assistantMessage)
        }

        // Success - exit retry loop
        break
      } catch (error) {
        retryCount++
        if (retryCount >= maxRetries) {
          yield {
            type: 'error',
            error: `Failed to get response from OpenRouter: ${error instanceof Error ? error.message : String(error)}`,
          }
        }
      }
    }
  }

  /**
   * Call OpenRouter API
   */
  private async callOpenRouter(apiKey: string, signal?: AbortSignal): Promise<OpenRouterResponse> {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://craft-agents.app',
        'X-Title': 'Craft Agents',
      },
      body: JSON.stringify({
        model: this.model,
        messages: this.conversationHistory,
        // TODO: Add tool definitions
        // tools: this.getToolDefinitions(),
      }),
      signal,
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }

    return await response.json()
  }

  /**
   * Execute a tool call
   * TODO: This needs to integrate with the existing tool execution system
   */
  private async executeToolCall(toolName: string, toolInput: any): Promise<any> {
    // Placeholder - needs actual tool execution
    throw new Error('Tool execution not yet implemented')
  }

  /**
   * Request escalation from user or auto-escalate based on permission mode
   */
  private async requestEscalation(toolName: string): Promise<boolean> {
    const mode = getPermissionMode(this.session?.id)

    if (mode === 'safe') {
      // Block escalation
      return false
    }

    if (mode === 'allow-all') {
      // Auto-escalate
      return true
    }

    // mode === 'ask': Prompt user
    if (this.onEscalationNeeded) {
      return await this.onEscalationNeeded(toolName, 3)
    }

    return false
  }

  /**
   * Escalate tool call to Claude SDK
   */
  private async escalateToolCall(toolName: string, toolInput: any): Promise<any> {
    // Lazy-create Claude agent for fallback
    if (!this.claudeFallback) {
      this.claudeFallback = new CraftAgent({
        workspace: this.workspace,
        session: this.session,
        model: 'claude-sonnet-4-5-20250929', // Use Sonnet for tool calls
      })

      // Set sources if we have them
      if (this.allSources.length > 0) {
        this.claudeFallback.setAllSources(this.allSources)
      }
    }

    // Execute ONE tool call with Claude
    // TODO: This needs actual integration with CraftAgent tool execution
    throw new Error('Claude escalation not yet fully implemented')
  }

  /**
   * Get OpenRouter API key from credentials
   */
  private async getApiKey(): Promise<string | null> {
    const credManager = getCredentialManager()
    const cred = await credManager.getCredential({ type: 'openrouter_api_key' })
    return cred?.value || null
  }

  /**
   * Get SDK session ID (for compatibility)
   */
  getSessionId(): string | null {
    return this.session?.id || null
  }

  /**
   * Stop processing (for compatibility)
   */
  stop(): void {
    // TODO: Implement abort logic
  }

  /**
   * Set model (for dynamic model switching)
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * Set thinking level (for compatibility)
   */
  setThinkingLevel(level: ThinkingLevel): void {
    this.thinkingLevel = level
  }
}
