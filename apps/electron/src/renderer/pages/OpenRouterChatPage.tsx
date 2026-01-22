/**
 * OpenRouterChatPage
 *
 * A chat interface for OpenRouter models.
 * Uses ChatDisplay for consistent UI with Agent mode, but with a simpler header.
 */

import * as React from 'react'
import { ChatDisplay } from '@/components/app-shell/ChatDisplay'
import { PanelHeader } from '@/components/app-shell/PanelHeader'
import { useAppShellContext, useSession as useSessionData } from '@/context/AppShellContext'
import { useAtomValue, useSetAtom } from 'jotai'
import { loadedSessionsAtom, ensureSessionMessagesLoadedAtom } from '@/atoms/sessions'
import { getSessionTitle } from '@/utils/session'
import * as storage from '@/lib/local-storage'

export interface OpenRouterChatPageProps {
    sessionId: string
}

export function OpenRouterChatPage({ sessionId }: OpenRouterChatPageProps) {
    const {
        currentModel,
        onSendMessage,
        onOpenFile,
        onOpenUrl,
        onMarkSessionRead,
        textareaRef,
        getDraft,
        onInputChange,
        activeWorkspaceId,
        enabledSources,
        skills,
        onSessionSourcesChange,
    } = useAppShellContext()

    const session = useSessionData(sessionId)
    const loadedSessions = useAtomValue(loadedSessionsAtom)
    const messagesLoaded = loadedSessions.has(sessionId)
    const ensureMessagesLoaded = useSetAtom(ensureSessionMessagesLoadedAtom)

    React.useEffect(() => {
        ensureMessagesLoaded(sessionId)
    }, [sessionId, ensureMessagesLoaded])

    React.useEffect(() => {
        if (session && !session.isProcessing) {
            onMarkSessionRead(session.id)
        }
    }, [session?.id, session?.isProcessing, onMarkSessionRead])

    const [inputValue, setInputValue] = React.useState(() => getDraft(sessionId))

    React.useEffect(() => {
        setInputValue(getDraft(sessionId))
    }, [getDraft, sessionId])

    const handleInputChange = React.useCallback((value: string) => {
        setInputValue(value)
        onInputChange(sessionId, value)
    }, [sessionId, onInputChange])

    const handleModelChange = React.useCallback((model: string) => {
        storage.set(storage.KEYS.openrouterLastModel, model)
        const workspaceId = session?.workspaceId || activeWorkspaceId
        if (workspaceId) {
            window.electronAPI.setSessionModel(sessionId, workspaceId, model)
        }
    }, [sessionId, activeWorkspaceId, session?.workspaceId])

    const displayTitle = session ? getSessionTitle(session) : 'Chat'
    const effectiveModel = session?.model || currentModel

    if (!session) {
        return (
            <div className="h-full flex flex-col">
                <PanelHeader title="Chat" />
                <div className="flex-1 flex items-center justify-center">
                    <p className="text-muted-foreground">Loading session...</p>
                </div>
            </div>
        )
    }

    return (
        <div className="h-full flex flex-col">
            <PanelHeader
              title={displayTitle}
            />
            <div className="flex-1 flex flex-col min-h-0">
                <ChatDisplay
                    session={session}
                    onSendMessage={(message, attachments, skillSlugs) => {
                        onSendMessage(session.id, message, attachments, skillSlugs)
                    }}
                    onOpenFile={onOpenFile}
                    onOpenUrl={onOpenUrl}
                    placeholder={[
                      'Ask anything…',
                      'Summarize this document',
                      'Draft a reply to this email',
                      'What should I do next?',
                    ]}
                    currentModel={effectiveModel}
                    onModelChange={handleModelChange}
                    textareaRef={textareaRef}
                    inputValue={inputValue}
                    onInputChange={handleInputChange}
                    messagesLoading={!messagesLoaded}
                    sources={enabledSources}
                    skills={skills}
                    workspaceId={activeWorkspaceId || undefined}
                    onSourcesChange={(slugs) => onSessionSourcesChange?.(sessionId, slugs)}
                    hideOptionBadges
                    hideModelSelector
                    showChatModeModelSelector
                />
            </div>
        </div>
    )
}

export default OpenRouterChatPage
