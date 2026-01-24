import { AlertCircle, Terminal, CheckCircle2 } from "lucide-react"

export interface CodexConnectProps {
    status: 'idle' | 'validating' | 'success' | 'error'
    errorMessage?: string
}

export function CodexConnect({ status, errorMessage }: CodexConnectProps) {
    return (
        <div className="space-y-4">
            <div className="rounded-lg border border-border bg-foreground/5 p-4">
                <div className="flex gap-3">
                    <div className="mt-0.5 text-foreground/70">
                        <Terminal className="size-5" />
                    </div>
                    <div className="space-y-1">
                        <p className="text-sm font-medium">CLI Authentication Required</p>
                        <p className="text-sm text-muted-foreground">
                            1. Open your terminal<br />
                            2. Run <code className="bg-background px-1.5 py-0.5 rounded border border-border font-mono text-xs">codex login</code><br />
                            3. Follow the instructions to sign in
                        </p>
                    </div>
                </div>
            </div>

            {status === 'error' && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive flex items-start gap-2">
                    <AlertCircle className="size-4 shrink-0 mt-0.5" />
                    <span>{errorMessage || "Failed to import credentials."}</span>
                </div>
            )}

            {status === 'success' && (
                <div className="rounded-md bg-green-500/10 p-3 text-sm text-green-600 flex items-center gap-2">
                    <CheckCircle2 className="size-4" />
                    <span>Successfully authenticated.</span>
                </div>
            )}
        </div>
    )
}
