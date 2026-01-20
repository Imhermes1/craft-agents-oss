/**
 * ChatModePage
 *
 * Displays a single OpenRouter chat session with ChatDisplay.
 * This is essentially the same as ChatPage but used in the chat mode navigator.
 * All the heavy lifting is done by ChatDisplay and the session management system.
 */

import * as React from 'react'
import { ChatPage } from './ChatPage'

export interface ChatModePageProps {
  sessionId: string
}

/**
 * ChatModePage component
 *
 * Simply wraps ChatPage since all the session display logic is already handled there.
 * The only difference is the navigator context (chat vs chats), which is handled
 * by the navigation system, not the page component itself.
 */
export function ChatModePage({ sessionId }: ChatModePageProps) {
  return <ChatPage sessionId={sessionId} />
}

export default ChatModePage
