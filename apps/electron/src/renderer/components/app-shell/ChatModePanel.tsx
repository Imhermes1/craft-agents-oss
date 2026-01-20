/**
 * ChatModePanel
 *
 * Panel component for displaying OpenRouter chat mode sessions in the 2nd sidebar.
 * Similar to SessionList but filtered to only show runtime: 'openrouter-chat' sessions.
 */

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionListItem } from './SessionListItem'
import type { Session } from '../../../shared/types'

export interface ChatModePanelProps {
  sessions: Session[]
  selectedSessionId?: string | null
  onSessionClick: (sessionId: string) => void
  onNewChat: () => void
  className?: string
}

export function ChatModePanel({
  sessions,
  selectedSessionId,
  onSessionClick,
  onNewChat,
  className,
}: ChatModePanelProps) {
  // Filter sessions to only show OpenRouter chat mode sessions
  const chatModeSessions = React.useMemo(() => {
    return sessions.filter(s => s.runtime === 'openrouter-chat')
  }, [sessions])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header with New Chat button */}
      <div className="px-3 py-3 border-b border-foreground/5">
        <Button
          onClick={onNewChat}
          className="w-full justify-start gap-2"
          size="sm"
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Sessions list */}
      <ScrollArea className="flex-1">
        <div className="pb-2">
          {chatModeSessions.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground mb-1">
                No chat sessions yet
              </p>
              <p className="text-xs text-muted-foreground/70">
                Create a new chat to get started with OpenRouter models
              </p>
            </div>
          ) : (
            <div className="pt-2">
              {chatModeSessions.map((session, index) => (
                <SessionListItem
                  key={session.id}
                  session={session}
                  isSelected={selectedSessionId === session.id}
                  isFirst={index === 0}
                  onClick={() => onSessionClick(session.id)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
