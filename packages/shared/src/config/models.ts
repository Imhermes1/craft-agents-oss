/**
 * Centralized model definitions for the entire application.
 * Update model IDs here when new versions are released.
 */

export type ModelVendor = 'anthropic' | 'openrouter';
export type ModelCapability = 'image' | 'web' | 'research' | 'thinking' | 'tools';

export interface ModelDefinition {
  id: string;
  name: string;
  shortName: string;
  description: string;
  vendor: ModelVendor;
  capabilities?: ModelCapability[];
}

// ============================================
// USER-SELECTABLE MODELS (shown in UI)
// ============================================

export const MODELS: ModelDefinition[] = [
  // Anthropic models (Claude Agent SDK)
  {
    id: 'claude-opus-4-5-20251101',
    name: 'Opus 4.5',
    shortName: 'Opus',
    description: 'Most capable',
    vendor: 'anthropic',
    capabilities: ['image', 'tools'],
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Sonnet 4.5',
    shortName: 'Sonnet',
    description: 'Balanced',
    vendor: 'anthropic',
    capabilities: ['image', 'tools'],
  },
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Haiku 4.5',
    shortName: 'Haiku',
    description: 'Fast & efficient',
    vendor: 'anthropic',
    capabilities: ['image', 'tools'],
  },

  // OpenRouter models
  {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    shortName: 'GPT-4o',
    description: 'OpenAI flagship',
    vendor: 'openrouter',
    capabilities: ['image', 'web', 'tools'],
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (OpenRouter)',
    shortName: 'Sonnet 3.5',
    description: 'Via OpenRouter',
    vendor: 'openrouter',
    capabilities: ['image', 'tools'],
  },
  {
    id: 'google/gemini-pro-1.5',
    name: 'Gemini Pro 1.5',
    shortName: 'Gemini Pro',
    description: 'Google model',
    vendor: 'openrouter',
    capabilities: ['image', 'web', 'tools'],
  },
  {
    id: 'deepseek/deepseek-r1',
    name: 'DeepSeek R1',
    shortName: 'DeepSeek R1',
    description: 'Reasoning model',
    vendor: 'openrouter',
    capabilities: ['thinking', 'tools'],
  },
  {
    id: 'perplexity/llama-3.1-sonar-large-128k-online',
    name: 'Perplexity Sonar',
    shortName: 'Sonar',
    description: 'Web search enabled',
    vendor: 'openrouter',
    capabilities: ['web', 'research', 'tools'],
  },
];

// ============================================
// PURPOSE-SPECIFIC DEFAULTS
// ============================================

/** Default model for main chat (user-facing) */
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

/** Model for agent definition extraction (always high quality) */
export const EXTRACTION_MODEL = 'claude-opus-4-5-20251101';

/** Model for API response summarization (cost efficient) */
export const SUMMARIZATION_MODEL = 'claude-haiku-4-5-20251001';

/** Model for instruction updates (high quality for accurate document editing) */
export const INSTRUCTION_UPDATE_MODEL = 'claude-opus-4-5-20251101';

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Get display name for a model ID (full name with version) */
export function getModelDisplayName(modelId: string): string {
  const model = MODELS.find(m => m.id === modelId);
  if (model) return model.name;
  // Fallback: strip prefix and date suffix
  return modelId.replace('claude-', '').replace(/-\d{8}$/, '');
}

/** Get short display name for a model ID (without version number) */
export function getModelShortName(modelId: string): string {
  const model = MODELS.find(m => m.id === modelId);
  if (model) return model.shortName;
  // Fallback: strip prefix and date suffix
  return modelId.replace('claude-', '').replace(/-[\d.-]+$/, '');
}

/** Check if model is an Opus model (for cache TTL decisions) */
export function isOpusModel(modelId: string): boolean {
  return modelId.includes('opus');
}
