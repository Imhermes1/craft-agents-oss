import * as React from 'react'
import ChatPage from './ChatPage'

export interface ChatModePageProps {
  sessionId: string
}

/**
 * ChatModePage component
 *
 * Uses unified ChatPage with variant="chat" for OpenRouter interface.
 */
export function ChatModePage({ sessionId }: ChatModePageProps) {
  return <ChatPage sessionId={sessionId} variant="chat" />
}

export default ChatModePage
