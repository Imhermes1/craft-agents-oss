/**
 * ChatModelSelector
 *
 * Advanced model selector for Chat mode with search, categories, and filtering.
 * Fetches ALL models from OpenRouter's API dynamically.
 */

import * as React from 'react'
import { useState, useMemo, useEffect } from 'react'
import { Search, ChevronDown, ChevronRight, Globe, Image, Sparkles, DollarSign, Zap, X, Check, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    DropdownMenu,
    DropdownMenuTrigger,
    DropdownMenuContent,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { OpenRouterModel } from '../../../shared/types'

// Model capabilities/tags derived from model data
export type ModelTag = 'free' | 'web' | 'image' | 'fast' | 'reasoning' | 'code'
    | 'tools'

export interface ChatModel {
    id: string
    name: string
    provider: string
    description?: string
    tags: ModelTag[]
    contextLength?: number
    promptPrice?: number  // per 1M tokens
    completionPrice?: number
}

const OPENAI_DIRECT_MODELS: ChatModel[] = [
    {
        id: 'gpt-5.2-codex',
        name: 'GPT-5.2 Codex',
        provider: 'OpenAI (Direct)',
        description: 'Codex-optimized GPT-5.2',
        tags: ['reasoning', 'code', 'tools'],
    },
    {
        id: 'gpt-5.2',
        name: 'GPT-5.2',
        provider: 'OpenAI (Direct)',
        description: 'Latest GPT model',
        tags: ['reasoning', 'code', 'tools'],
    },
    {
        id: 'gpt-5.2-mini',
        name: 'GPT-5.2 Mini',
        provider: 'OpenAI (Direct)',
        description: 'Smaller/faster GPT-5.2',
        tags: ['reasoning', 'fast', 'code', 'tools'],
    },
    {
        id: 'gpt-5.1-codex-max',
        name: 'GPT-5.1 Codex Max',
        provider: 'OpenAI (Direct)',
        description: 'Highest capability Codex model',
        tags: ['reasoning', 'code', 'tools'],
    },
    {
        id: 'gpt-5.1-codex-mini',
        name: 'GPT-5.1 Codex Mini',
        provider: 'OpenAI (Direct)',
        description: 'Smaller/faster Codex model',
        tags: ['reasoning', 'fast', 'code', 'tools'],
    },
]

// Tag config for display
const TAG_CONFIG: Record<ModelTag, { icon: React.ReactNode; label: string; color: string }> = {
    free: { icon: <DollarSign className="h-3 w-3" />, label: 'Free', color: 'text-green-500' },
    web: { icon: <Globe className="h-3 w-3" />, label: 'Web', color: 'text-blue-500' },
    image: { icon: <Image className="h-3 w-3" />, label: 'Image', color: 'text-purple-500' },
    fast: { icon: <Zap className="h-3 w-3" />, label: 'Fast', color: 'text-yellow-500' },
    reasoning: { icon: <Sparkles className="h-3 w-3" />, label: 'Reasoning', color: 'text-orange-500' },
    code: { icon: <span className="text-[10px] font-mono">&lt;/&gt;</span>, label: 'Code', color: 'text-cyan-500' },
    tools: { icon: <span className="text-[10px] font-mono">fn</span>, label: 'Tools', color: 'text-foreground/70' },
}

// Convert OpenRouter API model to our ChatModel format
function convertModel(m: OpenRouterModel): ChatModel {
    const tags: ModelTag[] = []

    // Determine tags from model properties
    const promptPrice = parseFloat(m.pricing?.prompt || '0') * 1000000 // Convert to per-1M
    const completionPrice = parseFloat(m.pricing?.completion || '0') * 1000000

    // Free if both prompt and completion are 0
    if (promptPrice === 0 && completionPrice === 0) {
        tags.push('free')
    }

    // Image capability from modality
    if (m.architecture?.modality?.includes('image') || m.id.includes('vision') || m.id.includes('gpt-4o') || m.id.includes('gemini')) {
        tags.push('image')
    }

    // Tool calling (OpenAI-style tools) - best-effort detection from OpenRouter metadata
    if (m.supported_parameters?.includes('tools') || m.supported_parameters?.includes('tool_choice') || m.supported_parameters?.includes('functions')) {
        tags.push('tools')
    }

    // Web/search capability
    if (m.id.includes('online') || m.id.includes('sonar') || m.id.includes('perplexity') || m.name?.toLowerCase().includes('online')) {
        tags.push('web')
    }

    // Reasoning models
    if (m.id.includes('o1') || m.id.includes('deepseek-r1') || m.id.includes('reasoning') || m.name?.toLowerCase().includes('reasoning')) {
        tags.push('reasoning')
    }

    // Code-focused models
    if (m.id.includes('coder') || m.id.includes('codestral') || m.id.includes('deepseek-v') || m.id.includes('qwen') || m.id.includes('starcoder')) {
        tags.push('code')
    }

    // Fast models (small context or explicitly fast)
    if (m.context_length && m.context_length < 32000 && !tags.includes('reasoning')) {
        tags.push('fast')
    }

    // Extract provider from model ID
    const provider = m.id.split('/')[0] || 'Unknown'
    const providerNames: Record<string, string> = {
        'openai': 'OpenAI',
        'anthropic': 'Anthropic',
        'google': 'Google',
        'meta-llama': 'Meta',
        'mistralai': 'Mistral AI',
        'deepseek': 'DeepSeek',
        'perplexity': 'Perplexity',
        'cohere': 'Cohere',
        'qwen': 'Alibaba',
        'microsoft': 'Microsoft',
        'x-ai': 'xAI',
    }

    return {
        id: m.id,
        name: m.name || m.id.split('/')[1] || m.id,
        provider: providerNames[provider] || provider,
        description: m.description?.slice(0, 100),
        tags,
        contextLength: m.context_length,
        promptPrice,
        completionPrice,
    }
}

// Default model to show while loading
const DEFAULT_MODEL: ChatModel = {
    id: 'openai/gpt-oss-120b:free',
    name: 'GPT-OSS-120B',
    provider: 'OpenAI',
    description: 'Free open source model',
    tags: ['free', 'code'],
    contextLength: 128000,
    promptPrice: 0,
    completionPrice: 0,
}

export interface ChatModelSelectorProps {
    selectedModel: ChatModel
    onSelectModel: (model: ChatModel) => void
    className?: string
}

export function ChatModelSelector({
    selectedModel,
    onSelectModel,
    className,
}: ChatModelSelectorProps) {
    const [open, setOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [activeFilters, setActiveFilters] = useState<ModelTag[]>([])
    const [models, setModels] = useState<ChatModel[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [gptSectionCollapsed, setGptSectionCollapsed] = useState(true) // Start collapsed

    // Fetch models from OpenRouter on mount
    useEffect(() => {
        async function fetchModels() {
            try {
                setIsLoading(true)
                const baseModels = [...OPENAI_DIRECT_MODELS]
                const openRouterModels = await window.electronAPI?.getOpenRouterModels()
                if (openRouterModels && openRouterModels.length > 0) {
                    const converted = openRouterModels.map(convertModel)
                    const merged = [
                        ...baseModels,
                        ...converted.filter(m => !baseModels.some(b => b.id === m.id)),
                    ]
                    // Sort: direct OpenAI first, then free, then provider, then name
                    merged.sort((a, b) => {
                        const aDirect = a.provider === 'OpenAI (Direct)' ? 0 : 1
                        const bDirect = b.provider === 'OpenAI (Direct)' ? 0 : 1
                        if (aDirect !== bDirect) return aDirect - bDirect

                        const aFree = a.tags.includes('free') ? 0 : 1
                        const bFree = b.tags.includes('free') ? 0 : 1
                        if (aFree !== bFree) return aFree - bFree

                        if (a.provider !== b.provider) return a.provider.localeCompare(b.provider)
                        return a.name.localeCompare(b.name)
                    })
                    setModels(merged)
                } else {
                    setModels(baseModels)
                }
            } catch (error) {
                console.error('Failed to fetch OpenRouter models:', error)
                setModels([...OPENAI_DIRECT_MODELS])
            } finally {
                setIsLoading(false)
            }
        }
        fetchModels()
    }, [])

    // Filter models based on search and tags
    const filteredModels = useMemo(() => {
        let result = models

        // Filter by search query
        if (searchQuery) {
            const query = searchQuery.toLowerCase()
            result = result.filter(m =>
                m.name.toLowerCase().includes(query) ||
                m.provider.toLowerCase().includes(query) ||
                m.id.toLowerCase().includes(query) ||
                m.description?.toLowerCase().includes(query) ||
                m.tags.some(t => t.includes(query))
            )
        }

        // Filter by active tags
        if (activeFilters.length > 0) {
            result = result.filter(m =>
                activeFilters.every(filter => m.tags.includes(filter))
            )
        }

        return result
    }, [models, searchQuery, activeFilters])

    const { gptModels, otherModels } = useMemo(() => {
        const gpt = filteredModels.filter(m => m.provider === 'OpenAI (Direct)')
        const other = filteredModels.filter(m => m.provider !== 'OpenAI (Direct)')
        return { gptModels: gpt, otherModels: other }
    }, [filteredModels])

    const toggleFilter = (tag: ModelTag) => {
        setActiveFilters(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        )
    }

    const formatPrice = (price: number | undefined) => {
        if (price === undefined) return '—'
        if (price === 0) return 'Free'
        if (price < 0.01) return `$${price.toFixed(4)}`
        if (price < 1) return `$${price.toFixed(2)}`
        return `$${price.toFixed(1)}`
    }

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <button className={cn(
                    "inline-flex items-center h-7 px-1.5 gap-0.5 text-[13px] shrink-0 rounded-[6px] hover:bg-foreground/5 transition-colors select-none",
                    open && "bg-foreground/5",
                    className
                )}>
                    <span className="truncate max-w-[150px]">{selectedModel.name}</span>
                    <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-96 p-0">
                {/* Search */}
                <div className="p-2 border-b border-border">
                    <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search models... (try 'free', 'gpt', 'claude')"
                            className="w-full pl-8 pr-3 py-1.5 text-sm bg-muted/50 rounded-md border-0 focus:outline-none focus:ring-1 focus:ring-accent"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>
                </div>

                {/* Tag Filters */}
                <div className="p-2 border-b border-border flex flex-wrap gap-1.5">
                    {(Object.keys(TAG_CONFIG) as ModelTag[]).map((tag) => {
                        const config = TAG_CONFIG[tag]
                        const isActive = activeFilters.includes(tag)
                        const count = models.filter(m => m.tags.includes(tag)).length
                        return (
                            <button
                                key={tag}
                                onClick={() => toggleFilter(tag)}
                                className={cn(
                                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-colors",
                                    isActive
                                        ? "bg-accent text-accent-foreground"
                                        : "bg-muted/50 text-muted-foreground hover:bg-muted"
                                )}
                            >
                                <span className={cn(!isActive && config.color)}>{config.icon}</span>
                                <span>{config.label}</span>
                                <span className="text-[10px] opacity-60">({count})</span>
                            </button>
                        )
                    })}
                </div>


                {/* Model count */}
                <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border">
                    {isLoading ? (
                        <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Loading models...
                        </span>
                    ) : (
                        `${filteredModels.length} of ${models.length} models`
                    )}
                </div>

                {/* Model List */}
                <ScrollArea className="h-[400px]">
                    <div className="p-1">
                        {isLoading ? (
                            <div className="py-8 text-center">
                                <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Loading models from OpenRouter...</p>
                            </div>
                        ) : filteredModels.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">
                                No models found
                            </div>
                        ) : (
                            <>
                                {gptModels.length > 0 && (
                                    <button
                                        onClick={() => setGptSectionCollapsed(!gptSectionCollapsed)}
                                        className="w-full flex items-center gap-1 px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide hover:bg-muted/30 transition-colors"
                                    >
                                        {gptSectionCollapsed ? (
                                            <ChevronRight className="h-3 w-3" />
                                        ) : (
                                            <ChevronDown className="h-3 w-3" />
                                        )}
                                        <span>GPT (OpenAI Direct)</span>
                                    </button>
                                )}
                                {gptModels.length > 0 && !gptSectionCollapsed && gptModels.map((model) => (
                                    <button
                                        key={model.id}
                                        onClick={() => {
                                            onSelectModel(model)
                                            setOpen(false)
                                        }}
                                        className={cn(
                                            "w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors",
                                            selectedModel.id === model.id
                                                ? "bg-accent/10"
                                                : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "font-medium text-sm truncate",
                                                    selectedModel.id === model.id && "text-accent"
                                                )}>
                                                    {model.name}
                                                </span>
                                                {selectedModel.id === model.id && (
                                                    <Check className="h-3.5 w-3.5 text-accent shrink-0" />
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {model.provider} {model.contextLength && `· ${(model.contextLength / 1000).toFixed(0)}K context`}
                                            </div>
                                            <div className="flex items-center gap-1 mt-1">
                                                {model.tags.slice(0, 4).map((tag) => {
                                                    const config = TAG_CONFIG[tag]
                                                    return (
                                                        <span
                                                            key={tag}
                                                            className={cn(
                                                                "flex items-center gap-0.5 text-[10px]",
                                                                config.color
                                                            )}
                                                            title={config.label}
                                                        >
                                                            {config.icon}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                                            {formatPrice(model.promptPrice)}/M
                                        </div>
                                    </button>
                                ))}

                                {otherModels.length > 0 && gptModels.length > 0 && (
                                    <div className="my-1 border-t border-border" />
                                )}

                                {otherModels.length > 0 && (
                                    <div className="px-2 py-1.5 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                                        Other Models (OpenRouter)
                                    </div>
                                )}
                                {otherModels.map((model) => (
                                    <button
                                        key={model.id}
                                        onClick={() => {
                                            onSelectModel(model)
                                            setOpen(false)
                                        }}
                                        className={cn(
                                            "w-full flex items-start gap-3 p-2 rounded-md text-left transition-colors",
                                            selectedModel.id === model.id
                                                ? "bg-accent/10"
                                                : "hover:bg-muted/50"
                                        )}
                                    >
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={cn(
                                                    "font-medium text-sm truncate",
                                                    selectedModel.id === model.id && "text-accent"
                                                )}>
                                                    {model.name}
                                                </span>
                                                {selectedModel.id === model.id && (
                                                    <Check className="h-3.5 w-3.5 text-accent shrink-0" />
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground truncate">
                                                {model.provider} {model.contextLength && `· ${(model.contextLength / 1000).toFixed(0)}K context`}
                                            </div>
                                            <div className="flex items-center gap-1 mt-1">
                                                {model.tags.slice(0, 4).map((tag) => {
                                                    const config = TAG_CONFIG[tag]
                                                    return (
                                                        <span
                                                            key={tag}
                                                            className={cn(
                                                                "flex items-center gap-0.5 text-[10px]",
                                                                config.color
                                                            )}
                                                            title={config.label}
                                                        >
                                                            {config.icon}
                                                        </span>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                        <div className="text-[10px] text-muted-foreground shrink-0 text-right">
                                            {formatPrice(model.promptPrice)}/M
                                        </div>
                                    </button>
                                ))}
                            </>
                        )}
                    </div>
                </ScrollArea>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

// Export default model for use in ChatHomePage
export { DEFAULT_MODEL }
