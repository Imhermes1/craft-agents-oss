/**
 * ChatModePage
 *
 * Displays a single OpenRouter chat session.
 * This is different from ChatPage (Agent mode) - it's a simpler LLM chat interface.
 */

import * as React from 'react'
import OpenRouterChatPage from './OpenRouterChatPage'

export interface ChatModePageProps {
  sessionId: string
}

/**
 * ChatModePage component
 *
 * Uses OpenRouterChatPage for the chat interface, which is designed for
 * simple LLM conversations without agentic capabilities.
 */
export function ChatModePage({ sessionId }: ChatModePageProps) {
  return <OpenRouterChatPage sessionId={sessionId} />
}

export default ChatModePage
