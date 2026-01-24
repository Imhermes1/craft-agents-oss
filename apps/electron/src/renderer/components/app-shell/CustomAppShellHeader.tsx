import * as React from "react"
import { ModeToggle, type AppMode } from "./ModeToggle"
import { cn } from "@/lib/utils"

interface CustomAppShellHeaderProps {
    mode: AppMode
    onChange: (mode: AppMode) => void
    className?: string
}

/**
 * CustomAppShellHeader
 * 
 * Isolated component for "Chat Mode" toggle and custom header logic.
 * Keeps AppShell.tsx clean and easy to update.
 */
export function CustomAppShellHeader({ mode, onChange, className }: CustomAppShellHeaderProps) {
    return (
        <div className={cn("px-2 pb-2", className)}>
            <ModeToggle value={mode} onChange={onChange} />
        </div>
    )
}
