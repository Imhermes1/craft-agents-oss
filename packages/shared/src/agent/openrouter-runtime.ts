/**
 * OpenRouter Runtime
 *
 * Alternative agent runtime that uses OpenRouter or OpenAI API with OpenAI-format messages.
 * Supports both OpenRouter models and native OpenAI GPT models.
 */

import type { AgentEvent } from '@craft-agent/core/types'
import type { Workspace } from '../config/storage.ts'
import type { SessionConfig as Session } from '../sessions/storage.ts'
import type { ThinkingLevel } from './thinking-levels.ts'
import type { LoadedSource } from '../sources/types.ts'
import { getCredentialManager } from '../credentials/index.ts'
import { CraftMcpClient } from '../mcp/client.ts'
import { loadWorkspaceSkills } from '../skills/storage.ts'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface OpenRouterRuntimeConfig {
  workspace: Workspace
  session?: Session
  model?: string
  thinkingLevel?: ThinkingLevel
  isHeadless?: boolean
}

export interface SendMessageOptions {
  message: string
  signal?: AbortSignal
}

type OpenAiRole = 'user' | 'assistant' | 'system' | 'tool'

interface OpenRouterMessage {
  role: OpenAiRole
  content: string | Array<{ type: string; text?: string;[key: string]: any }>
  tool_call_id?: string
  tool_calls?: OpenRouterToolCall[]
}

interface OpenRouterToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

interface OpenAiToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: unknown
  }
}

interface OpenRouterStreamChunk {
  id?: string
  error?: unknown
  choices?: Array<{
    delta?: {
      role?: 'assistant'
      content?: string
      tool_calls?: Array<{
        index: number
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
}

interface OpenRouterNonStreamResponse {
  id?: string
  choices?: Array<{
    message?: {
      role?: 'assistant' | 'tool' | 'system' | 'user'
      content?: string
      tool_calls?: Array<{
        id?: string
        type?: 'function'
        function?: {
          name?: string
          arguments?: string
        }
      }>
    }
    finish_reason?: string | null
  }>
}

function safeJsonStringify(value: unknown, maxLen: number = 2000): string {
  try {
    const s = JSON.stringify(value)
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s
  } catch {
    return '[unserializable]'
  }
}

function hasCodexAuthFile(): boolean {
  try {
    return existsSync(join(homedir(), '.codex', 'auth.json'))
  } catch {
    return false
  }
}

export class OpenRouterRuntime {
  private workspace: Workspace
  private session?: Session
  private model: string
  private thinkingLevel: ThinkingLevel
  private conversationHistory: OpenRouterMessage[] = []
  private allSources: LoadedSource[] = []
  private currentAbortController: AbortController | null = null
  private ultrathinkOverrideEnabled = false
  private mcpServers: Record<string, unknown> = {}
  private apiServers: Record<string, unknown> = {}
  private intendedSourceSlugs: string[] = []
  private toolMap: Map<string, { sourceSlug: string; mcpToolName: string }> = new Map()
  private apiToolMap: Map<string, { sourceSlug: string; toolName: string }> = new Map()
  private mcpClients: Map<string, CraftMcpClient> = new Map()

  constructor(config: OpenRouterRuntimeConfig) {
    this.workspace = config.workspace
    this.session = config.session
    this.model = config.model || 'openai/gpt-4o-mini'
    this.thinkingLevel = config.thinkingLevel || 'think'
  }

  /**
   * Determine if this model should use OpenAI API directly (vs OpenRouter)
   */
  private isOpenAIModel(model: string): boolean {
    // Native OpenAI models start with 'gpt-' (not 'openai/gpt-' which is OpenRouter)
    return model.startsWith('gpt-') && !model.startsWith('openai/')
  }

  /**
   * Get the appropriate API endpoint based on model
   */
  private getApiEndpoint(model: string): string {
    return this.isOpenAIModel(model)
      ? 'https://api.openai.com/v1/chat/completions'
      : 'https://openrouter.ai/api/v1/chat/completions'
  }

  /**
   * Set all available sources for context
   */
  setAllSources(sources: LoadedSource[]) {
    this.allSources = sources
  }

  /**
   * Send a message and stream response (OpenAI-style SSE)
   */
  async *sendMessage(
    content: string,
    options: SendMessageOptions
  ): AsyncGenerator<AgentEvent> {
    const baseHistory = [...this.conversationHistory]
    const userMessage: OpenRouterMessage = { role: 'user', content }

    // Skills: Chat mode supports @skill-slug mentions by injecting the skill
    // content as a temporary system message for the first model call only.
    const skillSystemMessages = await this.buildSkillSystemMessagesFromMentions(content)
    const firstRoundMessages = [...baseHistory, ...skillSystemMessages, userMessage]

    // Persist user message into history (skills are not persisted)
    this.conversationHistory = [...baseHistory, userMessage]

    // OpenAI "direct" models are run through the local Codex CLI, which uses the user's
    // ChatGPT/Codex login. OpenRouter models use OpenRouter API.
    if (this.isOpenAIModel(this.model)) {
      if (!hasCodexAuthFile()) {
        yield {
          type: 'error',
          message: `No Codex login found. Run 'codex login' then retry.`,
        }
        return
      }

      // Codex CLI doesn't support multi-round tool calling, use firstRoundMessages directly
      const prompt = this.buildCodexPrompt(firstRoundMessages)
      const stream = this.callCodexCliStream({
        signal: options.signal,
        model: this.model,
        prompt,
        cwd: this.workspace.rootPath,
      })

      let assistantText = ''
      while (true) {
        const { value, done } = await stream.next()
        if (done) {
          assistantText = value.content
          break
        }
        yield value
      }

      this.conversationHistory.push({ role: 'assistant', content: assistantText ?? '' })
      if (assistantText) {
        yield { type: 'text_complete', text: assistantText } as AgentEvent
      }
      return
    }

    // Get OpenRouter API key
    const apiKey = await this.getApiKey(this.model)
    if (!apiKey) {
      yield {
        type: 'error',
        message: `No OpenRouter API key configured. Please add your API key in Settings.`,
      }
      return
    }

    const maxToolRounds = 5
    for (let round = 0; round < maxToolRounds; round++) {
      const toolDefs = await this.getToolDefinitions()

      const stream = this.callOpenRouterStream(apiKey, {
        signal: options.signal,
        tools: toolDefs,
        messages: round === 0 ? firstRoundMessages : this.conversationHistory,
      })

      let assistantText = ''
      let toolCalls: OpenRouterToolCall[] = []
      let turnId: string | undefined

      while (true) {
        const { value, done } = await stream.next()
        if (done) {
          assistantText = value.content
          toolCalls = value.toolCalls
          turnId = value.turnId
          break
        }
        yield value
      }

      const hasToolCalls = toolCalls.length > 0

      // Add assistant message to history (include tool_calls for follow-up tool results)
      this.conversationHistory.push({
        role: 'assistant',
        content: assistantText ?? '',
        tool_calls: hasToolCalls ? toolCalls : undefined,
      })

      if (assistantText) {
        yield {
          type: 'text_complete',
          text: assistantText,
          isIntermediate: hasToolCalls,
          turnId,
        } as AgentEvent
      }

      if (!hasToolCalls) return

      // Execute tool calls, add tool results to history, then continue loop for final response.
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name
        let toolInput: Record<string, unknown> = {}
        try {
          toolInput = JSON.parse(toolCall.function.arguments || '{}')
        } catch {
          toolInput = {}
        }

        yield {
          type: 'tool_start',
          toolUseId: toolCall.id,
          toolName,
          input: toolInput,
          turnId,
        } as AgentEvent

        try {
          const result = await this.executeToolCall(toolName, toolInput)
          yield {
            type: 'tool_result',
            toolUseId: toolCall.id,
            result,
            isError: false,
            input: toolInput,
            turnId,
          } as AgentEvent
          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          })
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          yield {
            type: 'tool_result',
            toolUseId: toolCall.id,
            result: msg,
            isError: true,
            input: toolInput,
            turnId,
          } as AgentEvent
          this.conversationHistory.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: msg,
          })
        }
      }
    }

    yield {
      type: 'error',
      message: 'Too many tool call rounds; aborting to avoid infinite loop.',
    }
  }

  /**
   * Call OpenRouter or OpenAI Chat Completions with streaming (SSE).
   * Parses OpenAI-style deltas for content and tool calls.
   */
  private async *callOpenRouterStream(
    apiKey: string,
    options: { signal?: AbortSignal; tools: OpenAiToolDefinition[]; messages: OpenRouterMessage[] }
  ): AsyncGenerator<AgentEvent, { content: string; toolCalls: OpenRouterToolCall[]; turnId?: string }> {
    const endpoint = this.getApiEndpoint(this.model)
    const isOpenAI = this.isOpenAIModel(this.model)

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'Accept': 'text/event-stream',
    }

    // OpenRouter-specific headers
    if (!isOpenAI) {
      headers['HTTP-Referer'] = 'https://craft-agents.app'
      headers['X-Title'] = 'Craft Agents'
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.model,
        messages: options.messages,
        stream: true,
        tools: options.tools.length > 0 ? options.tools : undefined,
      }),
      signal: options.signal,
    })

    if (!response.ok) {
      const provider = isOpenAI ? 'OpenAI' : 'OpenRouter'
      const contentType = response.headers.get('content-type') || ''
      const errorBody = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : await response.text().catch(() => '')
      throw new Error(`${provider} API error: ${response.status} ${typeof errorBody === 'string' ? errorBody : safeJsonStringify(errorBody)}`)
    }

    if (!response.body) {
      const provider = isOpenAI ? 'OpenAI' : 'OpenRouter'
      throw new Error(`${provider} response missing body`)
    }

    // Some models/providers (or proxies) may ignore `stream: true` and return a
    // non-stream JSON response. Handle that gracefully instead of producing an
    // empty assistant response.
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/event-stream')) {
      const provider = isOpenAI ? 'OpenAI' : 'OpenRouter'
      const json = await response.json().catch(() => null)
      if (!json || typeof json !== 'object') {
        throw new Error(`${provider} non-stream response parse error: ${safeJsonStringify(json)}`)
      }

      const parsed = json as OpenRouterNonStreamResponse
      const message = parsed.choices?.[0]?.message
      const turnId = parsed.id

      const content = typeof message?.content === 'string' ? message.content : ''
      const toolCalls = (message?.tool_calls ?? [])
        .map((tc, index) => ({
          id: tc.id ?? `toolcall_${index}`,
          type: 'function' as const,
          function: {
            name: tc.function?.name ?? '',
            arguments: tc.function?.arguments ?? '',
          },
        }))
        .filter((tc) => tc.function.name)

      return { content, toolCalls, turnId }
    }

    const decoder = new TextDecoder()
    const reader = response.body.getReader()

    let buffer = ''
    const eventDataLines: string[] = []
    let content = ''
    let turnId: string | undefined
    const toolCallsByIndex = new Map<number, OpenRouterToolCall>()

    const flushEvent = (): AgentEvent[] => {
      const events: AgentEvent[] = []
      if (eventDataLines.length === 0) return events
      const data = eventDataLines.join('\n').trim()
      eventDataLines.length = 0
      if (!data || data === '[DONE]') return events

      let chunk: OpenRouterStreamChunk
      try {
        chunk = JSON.parse(data) as OpenRouterStreamChunk
      } catch {
        return events
      }

      if (chunk.error) {
        const provider = this.isOpenAIModel(this.model) ? 'OpenAI' : 'OpenRouter'
        const message =
          typeof (chunk as any).error?.message === 'string'
            ? (chunk as any).error.message
            : safeJsonStringify(chunk.error)
        throw new Error(`${provider} stream error: ${message}`)
      }

      if (!turnId && chunk.id) turnId = chunk.id
      const choice = chunk.choices?.[0]
      const delta = choice?.delta
      if (!delta) return events

      if (typeof delta.content === 'string' && delta.content.length > 0) {
        content += delta.content
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const existing = toolCallsByIndex.get(tc.index) ?? {
            id: tc.id ?? `toolcall_${tc.index}`,
            type: 'function' as const,
            function: { name: '', arguments: '' },
          }

          if (tc.id) existing.id = tc.id
          if (tc.function?.name) existing.function.name = tc.function.name
          if (tc.function?.arguments) existing.function.arguments += tc.function.arguments

          toolCallsByIndex.set(tc.index, existing)
        }
      }

      // Emit delta events for UI streaming
      if (typeof delta.content === 'string' && delta.content.length > 0) {
        events.push({ type: 'text_delta', text: delta.content, turnId } as AgentEvent)
      }

      return events
    }

    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        while (true) {
          const newlineIndex = buffer.indexOf('\n')
          if (newlineIndex === -1) break
          const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
          buffer = buffer.slice(newlineIndex + 1)

          if (line === '') {
            for (const ev of flushEvent()) yield ev
            continue
          }
          if (line.startsWith('data:')) {
            eventDataLines.push(line.slice(5).trimStart())
          }
        }
      }
    } finally {
      try {
        await reader.cancel()
      } catch {
        // ignore
      }
    }

    for (const ev of flushEvent()) yield ev

    return {
      content,
      toolCalls: Array.from(toolCallsByIndex.entries()).sort((a, b) => a[0] - b[0]).map(([, v]) => v).filter(tc => tc.function.name),
      turnId,
    }
  }

  private buildCodexPrompt(messages: OpenRouterMessage[]): string {
    const lines: string[] = []
    for (const m of messages) {
      const role = (m.role || 'user').toUpperCase()
      const text =
        typeof m.content === 'string'
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((p: any) => (typeof p?.text === 'string' ? p.text : '')).filter(Boolean).join('\n')
            : ''
      if (!text.trim()) continue
      lines.push(`${role}:\n${text.trim()}\n`)
    }
    lines.push('ASSISTANT:\n')
    return lines.join('\n')
  }

  private async *callCodexCliStream(options: {
    signal?: AbortSignal
    model: string
    prompt: string
    cwd: string
  }): AsyncGenerator<AgentEvent, { content: string }> {
    const args = [
      '--ask-for-approval', 'never',
      'exec',
      '--json',
      '--skip-git-repo-check',
      '--sandbox', 'read-only',
      '--model', options.model,
      '-',
    ]

    const child = spawn('codex', args, {
      cwd: options.cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env,
    })

    if (options.signal) {
      const onAbort = () => {
        try { child.kill('SIGTERM') } catch { /* ignore */ }
      }
      if (options.signal.aborted) onAbort()
      options.signal.addEventListener('abort', onAbort, { once: true })
    }

    child.stdin.write(options.prompt)
    child.stdin.end()

    const decoder = new TextDecoder()
    let stdoutBuf = ''
    let stderrBuf = ''
    let content = ''
    let hadError = false

    const emitText = (delta: string) => {
      if (!delta) return
      content += delta
      return { type: 'text_delta', text: delta } as AgentEvent
    }

    const handleEvent = (evt: any) => {
      const t = String(evt?.type || '')
      if (t === 'error' && typeof evt?.message === 'string') {
        hadError = true
        return [{ type: 'error', message: evt.message } as AgentEvent]
      }

      // Best-effort: surface assistant deltas if present.
      const delta =
        typeof evt?.delta === 'string' ? evt.delta :
          typeof evt?.text === 'string' ? evt.text :
            typeof evt?.content === 'string' ? evt.content :
              undefined

      if (typeof delta === 'string' && delta.length > 0 && t.includes('assistant')) {
        const ev = emitText(delta)
        return ev ? [ev] : []
      }

      return []
    }

    const readStream = async function* (stream: NodeJS.ReadableStream, isErr: boolean) {
      for await (const chunk of stream) {
        const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
        if (isErr) {
          stderrBuf += text
          continue
        }
        stdoutBuf += text
        while (true) {
          const idx = stdoutBuf.indexOf('\n')
          if (idx === -1) break
          const line = stdoutBuf.slice(0, idx).trim()
          stdoutBuf = stdoutBuf.slice(idx + 1)
          if (!line) continue
          let parsed: any
          try {
            parsed = JSON.parse(line)
          } catch {
            continue
          }
          for (const e of handleEvent(parsed)) {
            yield e
          }
        }
      }
    }

    // Process stdout and stderr concurrently
    // We yield events from stdout, stderr is just for debugging
    const stdoutGen = readStream(child.stdout, false)
    const stderrPromise = (async () => {
      for await (const _ of readStream(child.stderr, true)) {
        // stderr events discarded
      }
    })()

    // Yield all stdout events
    for await (const event of stdoutGen) {
      yield event
    }

    // Wait for stderr to finish
    await stderrPromise


    const exitCode: number = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 0)))

    if (!hadError && exitCode !== 0) {
      const msg = stderrBuf.trim() || `Codex exited with code ${exitCode}`
      yield { type: 'error', message: msg } as AgentEvent
      return { content: '' }
    }

    return { content }
  }

  private async buildSkillSystemMessagesFromMentions(text: string): Promise<OpenRouterMessage[]> {
    const slugs = this.extractAtMentionSlugs(text)
    if (slugs.length === 0) return []

    const skills = loadWorkspaceSkills(this.workspace.rootPath)
    if (skills.length === 0) return []

    const bySlug = new Map(skills.map(s => [s.slug, s]))
    const matched = slugs.map(s => bySlug.get(s)).filter(Boolean) as typeof skills
    if (matched.length === 0) return []

    const blocks = matched.map((s) => {
      const header = `# Skill: ${s.metadata.name} (@${s.slug})\n${s.metadata.description}\n`
      const body = (s.content || '').trim()
      return `${header}\n${body}`.trim()
    })

    return [{
      role: 'system',
      content: `The user referenced the following skill(s). Follow them when answering this message:\n\n${blocks.join('\n\n---\n\n')}`,
    }]
  }

  private extractAtMentionSlugs(text: string): string[] {
    const matches = text.match(/@([a-z0-9][a-z0-9_-]{1,63})/gi) ?? []
    const normalized = matches
      .map((m) => m.slice(1).toLowerCase())
      .filter(Boolean)
    return Array.from(new Set(normalized))
  }

  /**
   * Execute a tool call
   */
  private async executeToolCall(toolName: string, toolInput: Record<string, unknown>): Promise<string> {
    const apiMapping = this.apiToolMap.get(toolName)
    if (apiMapping) {
      return await this.executeApiToolCall(apiMapping.sourceSlug, apiMapping.toolName, toolInput)
    }

    const mapping = this.toolMap.get(toolName)
    if (!mapping) {
      throw new Error(`Unknown tool: ${toolName}`)
    }

    const client = await this.getOrCreateMcpClient(mapping.sourceSlug)
    const result = await client.callTool(mapping.mcpToolName, toolInput)

    // Prefer MCP text content if available
    if (result && typeof result === 'object' && 'content' in (result as any)) {
      const content = (result as any).content
      if (Array.isArray(content)) {
        const text = content
          .filter((c: any) => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n')
        if (text.trim()) return text
      }
    }

    return typeof result === 'string' ? result : safeJsonStringify(result, 8000)
  }

  private async executeApiToolCall(sourceSlug: string, toolName: string, toolInput: Record<string, unknown>): Promise<string> {
    const serverConfig = this.apiServers[sourceSlug] as any
    const serverInstance = serverConfig?.instance as any
    if (!serverInstance) throw new Error(`API server not configured: ${sourceSlug}`)

    const registered = (serverInstance._registeredTools ?? {}) as Record<string, any>
    const tool = registered[toolName]
    if (!tool) throw new Error(`API tool not found: ${toolName}`)

    const handler = tool.handler
    if (typeof handler !== 'function') throw new Error(`API tool handler missing for: ${toolName}`)

    // API tools follow MCP result shape: { content: [{type:'text', text}], isError? }
    const result = await handler(toolInput)

    if (result && typeof result === 'object' && 'content' in result) {
      const content = (result as any).content
      const isError = Boolean((result as any).isError)

      if (Array.isArray(content)) {
        const text = content
          .filter((c: any) => c && typeof c === 'object' && c.type === 'text' && typeof c.text === 'string')
          .map((c: any) => c.text)
          .join('\n')
        if (isError) throw new Error(text || 'API tool failed')
        if (text.trim()) return text
      }
    }

    return typeof result === 'string' ? result : safeJsonStringify(result, 8000)
  }

  /**
   * Convert currently selected MCP tools into OpenAI tool definitions.
   */
  private async getToolDefinitions(): Promise<OpenAiToolDefinition[]> {
    this.toolMap.clear()
    this.apiToolMap.clear()

    const allSlugs = new Set<string>([
      ...Object.keys(this.mcpServers),
      ...Object.keys(this.apiServers),
    ])

    const activeSlugs = this.intendedSourceSlugs.length > 0
      ? this.intendedSourceSlugs.filter(s => allSlugs.has(s))
      : [...allSlugs]

    if (activeSlugs.length === 0) return []

    const defs: OpenAiToolDefinition[] = []

    for (const sourceSlug of activeSlugs) {
      // 1) MCP sources (external stdio/http MCP servers)
      if (this.mcpServers[sourceSlug]) {
        try {
          const client = await this.getOrCreateMcpClient(sourceSlug)
          const tools = await client.listTools()

          for (const tool of tools) {
            const openAiName = this.toOpenAiToolName(sourceSlug, tool.name)
            this.toolMap.set(openAiName, { sourceSlug, mcpToolName: tool.name })

            defs.push({
              type: 'function',
              function: {
                name: openAiName,
                description: tool.description,
                parameters: (tool as any).inputSchema ?? { type: 'object', additionalProperties: true },
              },
            })
          }
        } catch {
          // Ignore tool listing errors; chat can still function without tools.
        }
      }

      // 2) API sources (in-process SDK MCP servers)
      if (this.apiServers[sourceSlug]) {
        try {
          const serverConfig = this.apiServers[sourceSlug] as any
          const serverInstance = serverConfig?.instance as any
          if (!serverInstance) continue

          // Ensure handlers are initialized (SDK server builds list/call handlers lazily).
          if (typeof serverInstance.setToolRequestHandlers === 'function') {
            serverInstance.setToolRequestHandlers()
          }

          const registered = (serverInstance._registeredTools ?? {}) as Record<string, any>
          for (const [toolName, toolDef] of Object.entries(registered)) {
            if (toolDef && toolDef.enabled === false) continue

            const openAiName = this.toOpenAiToolName(sourceSlug, toolName)
            this.apiToolMap.set(openAiName, { sourceSlug, toolName })

            defs.push({
              type: 'function',
              function: {
                name: openAiName,
                description: typeof toolDef?.description === 'string' ? toolDef.description : undefined,
                parameters: toolDef?.inputSchema ?? { type: 'object', additionalProperties: true },
              },
            })
          }
        } catch {
          // Ignore tool listing errors; chat can still function without API tools.
        }
      }
    }

    return defs
  }

  /**
   * Translate (sourceSlug, toolName) into a stable OpenAI function name.
   */
  private toOpenAiToolName(sourceSlug: string, toolName: string): string {
    const raw = `${sourceSlug}__${toolName}`
    return raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  }

  private async getOrCreateMcpClient(sourceSlug: string): Promise<CraftMcpClient> {
    const existing = this.mcpClients.get(sourceSlug)
    if (existing) return existing

    const config = this.mcpServers[sourceSlug] as any
    if (!config) throw new Error(`MCP server not configured: ${sourceSlug}`)

    const clientConfig =
      config.type === 'stdio'
        ? { transport: 'stdio' as const, command: config.command, args: config.args, env: config.env }
        : { transport: 'http' as const, url: config.url, headers: config.headers }

    const client = new CraftMcpClient(clientConfig)
    this.mcpClients.set(sourceSlug, client)
    return client
  }

  /**
   * Get API key from credentials (OpenRouter or OpenAI based on model)
   */
  private async getApiKey(model: string): Promise<string | null> {
    const credManager = getCredentialManager()
    if (this.isOpenAIModel(model)) {
      // OpenAI direct models are handled via Codex CLI; no API key required here.
      return null
    }
    return (await credManager.getOpenRouterApiKey()) || process.env.OPENROUTER_API_KEY || null
  }

  /**
   * Get SDK session ID (for compatibility)
   */
  getSessionId(): string | null {
    return this.session?.id || null
  }

  /**
   * Get model (for compatibility with CraftAgent)
   */
  getModel(): string {
    return this.model
  }

  /**
   * Chat API (for compatibility with CraftAgent)
   */
  async *chat(
    userMessage: string,
    _attachments?: unknown[],
    _isRetry: boolean = false
  ): AsyncGenerator<AgentEvent> {
    if (!userMessage.trim()) {
      yield { type: 'error', message: 'Cannot send empty message' }
      yield { type: 'complete' }
      return
    }

    const controller = new AbortController()
    this.currentAbortController = controller

    try {
      yield* this.sendMessage(userMessage, { message: userMessage, signal: controller.signal })
    } finally {
      this.currentAbortController = null
      this.ultrathinkOverrideEnabled = false
      yield { type: 'complete' }
    }
  }

  /**
   * Apply source servers (compatibility no-op for now).
   */
  setSourceServers(
    mcpServers: Record<string, unknown>,
    apiServers: Record<string, unknown>,
    intendedSlugs?: string[]
  ): void {
    this.mcpServers = mcpServers
    this.apiServers = apiServers
    this.intendedSourceSlugs = intendedSlugs ?? []
  }

  /**
   * Single-shot ultrathink override (compatibility no-op for now).
   */
  setUltrathinkOverride(enabled: boolean): void {
    this.ultrathinkOverrideEnabled = enabled
  }

  /**
   * Working directory updates (compatibility no-op for now).
   */
  updateWorkingDirectory(_path: string): void {
    // OpenRouter runtime does not currently execute tools/shell commands.
  }

  /**
   * Permission response handler (compatibility no-op).
   */
  respondToPermission(_requestId: string, _allowed: boolean, _alwaysAllow: boolean = false): void {
    // OpenRouter runtime does not currently request permissions.
  }

  /**
   * Mark a source unseen (compatibility no-op).
   */
  markSourceUnseen(_slug: string): void {
    // OpenRouter runtime does not currently inject source guides.
  }

  /**
   * Abort the current request (compatibility with CraftAgent)
   */
  forceAbort(_reason?: unknown): void {
    this.currentAbortController?.abort()
    this.currentAbortController = null
  }

  async close(): Promise<void> {
    this.forceAbort()
    for (const client of this.mcpClients.values()) {
      await client.close().catch(() => { })
    }
    this.mcpClients.clear()
  }

  dispose(): void {
    this.forceAbort()
  }

  /**
   * Stop processing (for compatibility)
   */
  stop(): void {
    this.forceAbort()
  }

  /**
   * Set model (for dynamic model switching)
   */
  setModel(model: string): void {
    this.model = model
  }

  /**
   * Set thinking level (for compatibility)
   */
  setThinkingLevel(level: ThinkingLevel): void {
    this.thinkingLevel = level
  }
}
