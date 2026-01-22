/**
 * ChatHomePage
 *
 * Welcome page for Craft document browsing mode.
 * Shows a greeting and instructions for browsing Craft documents.
 */

import * as React from 'react'
import { FileText, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ChatHomePageProps {
    userName?: string
    className?: string
}

function getGreeting(): string {
    const hour = new Date().getHours()
    if (hour < 12) return 'Good morning'
    if (hour < 17) return 'Good afternoon'
    return 'Good evening'
}

function getDayOfWeek(): string {
    return new Date().toLocaleDateString('en-US', { weekday: 'long' })
}

export function ChatHomePage({
    userName,
    className,
}: ChatHomePageProps) {
    return (
        <div className={cn('flex flex-col items-center justify-center h-full px-6', className)}>
            {/* Greeting */}
            <div className="text-center mb-12">
                <div className="flex items-center justify-center gap-3 mb-4">
                    <FileText className="h-12 w-12 text-accent" />
                </div>
                <h1 className="text-3xl font-semibold text-foreground mb-2">
                    {getGreeting()}{userName ? `, ${userName}` : ''}
                </h1>
                <p className="text-sm text-muted-foreground mb-1">
                    Happy {getDayOfWeek()}
                </p>
            </div>

            {/* Instructions */}
            <div className="max-w-md text-center space-y-4">
                <div className="flex items-start gap-3 p-4 bg-accent/5 rounded-lg">
                    <FolderOpen className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                        <h3 className="font-medium text-sm mb-1">Browse Your Documents</h3>
                        <p className="text-xs text-muted-foreground">
                            Select a folder from the sidebar to view your Craft documents
                        </p>
                    </div>
                </div>

                <div className="flex items-start gap-3 p-4 bg-accent/5 rounded-lg">
                    <FileText className="h-5 w-5 text-accent flex-shrink-0 mt-0.5" />
                    <div className="text-left">
                        <h3 className="font-medium text-sm mb-1">View & Edit</h3>
                        <p className="text-xs text-muted-foreground">
                            Click any document to view and edit its contents
                        </p>
                    </div>
                </div>
            </div>
        </div>
    )
}
