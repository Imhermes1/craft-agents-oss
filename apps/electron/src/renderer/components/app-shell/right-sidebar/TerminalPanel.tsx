import * as React from 'react'
import { useState, useRef, useEffect } from 'react'
import { Terminal, Send, Trash2, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

// Simplified local TerminalOutput to avoid import issues
function TerminalOutput({ command, output, exitCode, className }: { command: string, output: string, exitCode: number, className?: string }) {
    return (
        <div className={cn("flex flex-col gap-2 p-3 font-mono text-sm", className)}>
            <div className="flex items-center gap-2 text-muted-foreground select-none">
                <span className="text-green-500">➜</span>
                <span className="font-bold">{command}</span>
            </div>
            <pre className="whitespace-pre-wrap break-words text-foreground">
                {output || <span className="text-muted-foreground italic opacity-50">(no output)</span>}
            </pre>
            {exitCode !== 0 && (
                <div className="text-red-500 text-xs mt-1">Exit code: {exitCode}</div>
            )}
        </div>
    )
}

interface CommandHistory {
    id: string
    command: string
    output: string
    cwd: string
    exitCode: number
    timestamp: number
}

interface TerminalPanelProps {
    initialCwd?: string
    closeButton?: React.ReactNode
}

export function TerminalPanel({ initialCwd, closeButton }: TerminalPanelProps) {
    const [cwd, setCwd] = useState<string>(initialCwd || '')
    const [history, setHistory] = useState<CommandHistory[]>([])
    const [input, setInput] = useState('')
    const [isRunning, setIsRunning] = useState(false)
    const [commandHistoryIndex, setCommandHistoryIndex] = useState(-1)
    const [commandBuffer, setCommandBuffer] = useState<string[]>([])

    const scrollRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        if (scrollRef.current) {
            const scrollable = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]')
            if (scrollable) {
                scrollable.scrollTop = scrollable.scrollHeight
            }
        }
    }, [history])

    useEffect(() => {
        if (!cwd && typeof window !== 'undefined') {
            window.electronAPI.getHomeDir().then(setCwd)
        }
    }, [])

    const handleRun = async () => {
        if (!input.trim() || isRunning) return

        const cmd = input.trim()
        setInput('')
        setIsRunning(true)
        setCommandBuffer(prev => [...prev, cmd])
        setCommandHistoryIndex(-1)

        const tempId = Math.random().toString(36).substr(2, 9)

        try {
            if (cmd.startsWith('cd ')) {
                const target = cmd.substring(3).trim()
                if (target.startsWith('/')) {
                    setCwd(target)
                }
            }

            const result = await window.electronAPI.runCommand(cmd, cwd)

            setHistory(prev => [...prev, {
                id: tempId,
                command: cmd,
                output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
                cwd: cwd,
                exitCode: result.exitCode,
                timestamp: Date.now()
            }])
        } catch (error) {
            setHistory(prev => [...prev, {
                id: tempId,
                command: cmd,
                output: error instanceof Error ? error.message : String(error),
                cwd: cwd,
                exitCode: 1,
                timestamp: Date.now()
            }])
        } finally {
            setIsRunning(false)
            setTimeout(() => inputRef.current?.focus(), 10)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleRun()
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (commandBuffer.length > 0) {
                const newIndex = commandHistoryIndex === -1
                    ? commandBuffer.length - 1
                    : Math.max(0, commandHistoryIndex - 1)
                setCommandHistoryIndex(newIndex)
                setInput(commandBuffer[newIndex])
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (commandBuffer.length > 0 && commandHistoryIndex !== -1) {
                const newIndex = Math.min(commandBuffer.length - 1, commandHistoryIndex + 1)
                setCommandHistoryIndex(newIndex)
                setInput(commandBuffer[newIndex])

                if (newIndex === commandBuffer.length - 1 && commandHistoryIndex === commandBuffer.length - 1) {
                    setCommandHistoryIndex(-1)
                    setInput('')
                }
            }
        }
    }

    return (
        <div className="flex flex-col h-full bg-background border-l rounded-xl overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-3 border-b shrink-0 bg-muted/30">
                <div className="flex items-center gap-2 text-sm font-medium">
                    <Terminal className="w-4 h-4" />
                    <span>Terminal</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setHistory([])} title="Clear">
                        <Trash2 className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => window.electronAPI.openTerminal(cwd)} title="Open in New Window">
                        <Maximize2 className="w-4 h-4" />
                    </Button>
                    {closeButton && (
                        <div className="ml-1">
                            {closeButton}
                        </div>
                    )}
                </div>
            </div>

            <ScrollArea ref={scrollRef} className="flex-1 p-2">
                {history.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50 p-8 text-center">
                        <Terminal className="w-8 h-8 mb-2" />
                        <p>No commands run yet.</p>
                        <p className="text-xs mt-1">Directory: {cwd}</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {history.map(item => (
                            <TerminalOutput
                                key={item.id}
                                command={item.command}
                                output={item.output}
                                exitCode={item.exitCode}
                                className="rounded-md border bg-card"
                            />
                        ))}
                    </div>
                )}
            </ScrollArea>

            <div className="p-3 border-t shrink-0 bg-background">
                <div className="mb-2 text-xs text-muted-foreground font-mono truncate px-1">
                    {cwd} $
                </div>
                <div className="flex gap-2">
                    <Input
                        autoFocus
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type a command..."
                        className="font-mono text-sm"
                        disabled={isRunning}
                    />
                    <Button onClick={handleRun} disabled={!input.trim() || isRunning} size="icon">
                        <Send className="w-4 h-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
