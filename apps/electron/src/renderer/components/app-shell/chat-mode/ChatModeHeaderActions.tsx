import * as React from 'react'
import { cn } from '@/lib/utils'
import { ChatModelSelector, DEFAULT_MODEL, type ChatModel } from '@/components/app-shell/ChatModelSelector'

export interface ChatModeHeaderActionsProps {
  modelId: string
  onModelIdChange: (modelId: string) => void
  className?: string
}

function toSelectedModel(modelId: string): ChatModel {
  if (!modelId) return DEFAULT_MODEL
  const isOpenRouterStyle = modelId.includes('/')
  const isOpenAIDirect = modelId.startsWith('gpt-')
  const [provider, name] = isOpenRouterStyle ? modelId.split('/', 2) : [undefined, undefined]
  return {
    ...DEFAULT_MODEL,
    id: modelId,
    name: isOpenRouterStyle ? (name || modelId) : modelId,
    provider: isOpenRouterStyle ? (provider || DEFAULT_MODEL.provider) : (isOpenAIDirect ? 'OpenAI (Direct)' : DEFAULT_MODEL.provider),
  }
}

export function ChatModeHeaderActions({ modelId, onModelIdChange, className }: ChatModeHeaderActionsProps) {
  const selectedModel = React.useMemo(() => toSelectedModel(modelId), [modelId])

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="text-[11px] font-medium px-2 h-7 rounded-[8px] bg-foreground/5 text-foreground/70 flex items-center select-none">
        Chat mode
      </div>
      <ChatModelSelector
        selectedModel={selectedModel}
        onSelectModel={(m) => onModelIdChange(m.id)}
      />
    </div>
  )
}
