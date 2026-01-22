import * as React from "react"
import { cn } from "@/lib/utils"

export type AppMode = "agent" | "chat"

interface ModeToggleProps {
    value: AppMode
    onChange: (mode: AppMode) => void
    className?: string
}

/**
 * ModeToggle - Segmented control for switching between Agent and Chat modes
 * 
 * Similar to Claude's "Chat | Cowork | Code" toggle at the top of the sidebar.
 * Uses a pill-style segmented control with smooth transitions.
 */
export function ModeToggle({ value, onChange, className }: ModeToggleProps) {
    return (
        <div
            className={cn(
                "flex items-center p-0.5 rounded-lg bg-foreground/[0.08] border border-foreground/[0.12]",
                className
            )}
        >
            <button
                onClick={() => onChange("chat")}
                className={cn(
                    "flex-1 px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200",
                    value === "chat"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-foreground/70 hover:text-foreground hover:bg-foreground/5"
                )}
            >
                Chat
            </button>
            <button
                onClick={() => onChange("agent")}
                className={cn(
                    "flex-1 px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200",
                    value === "agent"
                        ? "bg-background shadow-sm text-foreground"
                        : "text-foreground/70 hover:text-foreground hover:bg-foreground/5"
                )}
            >
                Agent
            </button>
        </div>
    )
}
