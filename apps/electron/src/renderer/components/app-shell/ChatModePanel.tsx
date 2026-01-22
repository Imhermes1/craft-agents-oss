/**
 * ChatModePanel
 *
 * Panel component for displaying OpenRouter chat mode sessions in the 2nd sidebar.
 * Similar to SessionList but filtered to only show runtime: 'openrouter-chat' sessions.
 */

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, MessageSquare, ListFilter, Check, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SessionListItem } from './SessionListItem'
import type { SessionMeta } from '@/atoms/sessions'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from '@/components/ui/styled-dropdown'
import { HeaderIconButton } from '@/components/ui/HeaderIconButton'
import { PanelHeader } from './PanelHeader'

import type { TodoStateId } from '@/config/todo-states'

export interface ChatModePanelProps {
  sessions: SessionMeta[]
  selectedSessionId?: string | null
  onSessionClick: (sessionId: string) => void
  onNewChat: () => void
  onDelete?: (sessionId: string) => Promise<void>
  onRename?: (sessionId: string, name: string) => void
  onFlag?: (sessionId: string) => void
  onUnflag?: (sessionId: string) => void
  onMarkUnread?: (sessionId: string) => void
  onTodoStateChange?: (sessionId: string, state: TodoStateId) => void
  onOpenInNewWindow?: (sessionId: string) => void
  todoStates?: Array<{ id: TodoStateId; label: string; icon: React.ReactNode; color: string; iconColorable?: boolean }>
  className?: string
}

export function ChatModePanel({
  sessions,
  selectedSessionId,
  onSessionClick,
  onNewChat,
  onDelete,
  onRename,
  onFlag,
  onUnflag,
  onMarkUnread,
  onTodoStateChange,
  onOpenInNewWindow,
  todoStates = [],
  className,
}: ChatModePanelProps) {
  const [filter, setFilter] = React.useState<{ type: 'all' | 'flagged' | 'state'; stateId?: TodoStateId }>({ type: 'all' })

  // Filter sessions to only show OpenRouter chat mode sessions and apply the selected filter
  const filteredSessions = React.useMemo(() => {
    let list = sessions.filter(s => s.runtime === 'openrouter-chat')

    if (filter.type === 'flagged') {
      list = list.filter(s => s.isFlagged)
    } else if (filter.type === 'state' && filter.stateId) {
      list = list.filter(s => s.todoState === filter.stateId)
    }

    return list
  }, [sessions, filter])

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Sessions list removed as requested */}
    </div>
  )
}
