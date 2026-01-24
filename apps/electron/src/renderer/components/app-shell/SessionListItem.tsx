/**
 * SessionListItem
 *
 * A simplified session list item component for the ChatModePanel.
 */

import * as React from 'react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import type { SessionMeta } from '@/atoms/sessions'
import {
    ContextMenu,
    ContextMenuTrigger,
    StyledContextMenuContent,
} from '@/components/ui/styled-context-menu'
import { ContextMenuProvider } from '@/components/ui/menu-context'
import { SessionMenu } from './SessionMenu'
import { getSessionTitle } from '@/utils/session'
import { toast } from 'sonner'
import type { TodoStateId } from '@/config/todo-states'
import { RenameDialog } from '@/components/ui/rename-dialog'

export interface SessionListItemProps {
    session: SessionMeta
    isSelected: boolean
    isFirst?: boolean
    onClick: () => void
    onDelete?: (sessionId: string) => Promise<void>
    onRename?: (sessionId: string, name: string) => void
    onFlag?: (sessionId: string) => void
    onUnflag?: (sessionId: string) => void
    onMarkUnread?: (sessionId: string) => void
    onTodoStateChange?: (sessionId: string, state: TodoStateId) => void
    onOpenInNewWindow?: (sessionId: string) => void
    todoStates?: Array<{ id: TodoStateId; label: string; icon: React.ReactNode; color: string; iconColorable?: boolean }>
}

function getSessionTodoState(session: SessionMeta): TodoStateId {
    return (session.todoState as TodoStateId) || 'todo'
}

function hasUnreadMessages(session: SessionMeta): boolean {
    if (!session.lastFinalMessageId) return false
    return session.lastFinalMessageId !== session.lastReadMessageId
}

function hasMessages(session: SessionMeta): boolean {
    return session.lastFinalMessageId !== undefined
}

export function SessionListItem({
    session,
    isSelected,
    isFirst,
    onClick,
    onDelete,
    onRename,
    onFlag,
    onUnflag,
    onMarkUnread,
    onTodoStateChange,
    onOpenInNewWindow,
    todoStates = [],
}: SessionListItemProps) {
    const [contextMenuOpen, setContextMenuOpen] = React.useState(false)
    const [renameDialogOpen, setRenameDialogOpen] = React.useState(false)
    const [renameName, setRenameName] = React.useState('')

    const handleRenameClick = React.useCallback(() => {
        setRenameName(getSessionTitle(session))
        requestAnimationFrame(() => {
            setRenameDialogOpen(true)
        })
    }, [session])

    const handleRenameSubmit = React.useCallback(() => {
        if (onRename && renameName.trim()) {
            onRename(session.id, renameName.trim())
        }
        setRenameDialogOpen(false)
        setRenameName('')
    }, [onRename, session.id, renameName])

    const handleDelete = React.useCallback(async () => {
        if (!onDelete) return
        await onDelete(session.id)
    }, [onDelete, session.id])

    const handleOpenInNewWindow = React.useCallback(() => {
        if (onOpenInNewWindow) {
            onOpenInNewWindow(session.id)
        }
    }, [onOpenInNewWindow, session.id])

    return (
        <>
            <ContextMenu modal={true} onOpenChange={setContextMenuOpen}>
                <ContextMenuTrigger asChild>
                    <button
                        onClick={onClick}
                        className={cn(
                            'group relative flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors',
                            isSelected ? 'bg-accent/10' : 'hover:bg-foreground/5',
                            !isFirst && 'border-t border-foreground/5'
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                <span className={cn(
                                    'truncate text-sm font-medium transition-colors',
                                    isSelected ? 'text-accent' : 'text-foreground/90'
                                )}>
                                    {session.name || session.preview || 'New Chat'}
                                </span>
                                {session.runtime === 'openrouter-chat' && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                        Chat
                                    </span>
                                )}
                                {(!session.runtime || session.runtime === 'claude') && (
                                    <span className="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                        Agent
                                    </span>
                                )}
                            </div>
                            <span className="shrink-0 text-[10px] text-muted-foreground/60">
                                {session.lastMessageAt && formatDistanceToNow(new Date(session.lastMessageAt), { addSuffix: true })}
                            </span>
                        </div>

                        {session.preview && !session.name && (
                            <div className="text-xs text-muted-foreground/60 truncate">
                                {session.preview}
                            </div>
                        )}

                        {isSelected && (
                            <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-accent" />
                        )}
                    </button>
                </ContextMenuTrigger>
                <StyledContextMenuContent>
                    <ContextMenuProvider>
                        <SessionMenu
                            sessionId={session.id}
                            sessionName={getSessionTitle(session)}
                            isFlagged={session.isFlagged ?? false}
                            sharedUrl={session.sharedUrl}
                            hasMessages={hasMessages(session)}
                            hasUnreadMessages={hasUnreadMessages(session)}
                            currentTodoState={getSessionTodoState(session)}
                            todoStates={todoStates as any}
                            onRename={handleRenameClick}
                            onFlag={() => onFlag?.(session.id)}
                            onUnflag={() => onUnflag?.(session.id)}
                            onMarkUnread={() => onMarkUnread?.(session.id)}
                            onTodoStateChange={(state) => onTodoStateChange?.(session.id, state)}
                            onOpenInNewWindow={handleOpenInNewWindow}
                            onDelete={handleDelete}
                        />
                    </ContextMenuProvider>
                </StyledContextMenuContent>
            </ContextMenu>

            <RenameDialog
                open={renameDialogOpen}
                onOpenChange={setRenameDialogOpen}
                title="Rename Chat"
                value={renameName}
                onValueChange={setRenameName}
                onSubmit={handleRenameSubmit}
            />
        </>
    )
}
