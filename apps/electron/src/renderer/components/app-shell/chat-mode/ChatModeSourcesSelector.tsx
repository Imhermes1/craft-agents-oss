import * as React from 'react'
import { Check, DatabaseZap, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SourceAvatar } from '@/components/ui/source-avatar'
import type { LoadedSource } from '../../../../shared/types'

export interface ChatModeSourcesSelectorProps {
  sources: LoadedSource[]
  enabledSourceSlugs: string[]
  onChange: (slugs: string[]) => void
  className?: string
}

export function ChatModeSourcesSelector({
  sources,
  enabledSourceSlugs,
  onChange,
  className,
}: ChatModeSourcesSelectorProps) {
  const [open, setOpen] = React.useState(false)
  const [query, setQuery] = React.useState('')

  const enabledSet = React.useMemo(() => new Set(enabledSourceSlugs), [enabledSourceSlugs])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = sources.filter(s => s.config.enabled)
    if (!q) return list
    return list.filter(s =>
      s.config.name.toLowerCase().includes(q) ||
      s.config.slug.toLowerCase().includes(q)
    )
  }, [sources, query])

  const enabledSources = React.useMemo(() => {
    return sources.filter(s => enabledSet.has(s.config.slug))
  }, [sources, enabledSet])

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery('') }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center h-7 px-2 gap-1.5 text-[13px] shrink-0 rounded-[8px] bg-foreground/5 hover:bg-foreground/7 transition-colors select-none",
            className
          )}
          title="Sources"
        >
          {enabledSources.length === 0 ? (
            <DatabaseZap className="h-3.5 w-3.5 text-foreground/60" />
          ) : (
            <div className="flex items-center -ml-0.5">
              {enabledSources.slice(0, 3).map((source, index) => (
                <div
                  key={source.config.slug}
                  className={cn("relative h-5 w-5 rounded-[5px] bg-background shadow-minimal flex items-center justify-center", index > 0 && "-ml-1")}
                  style={{ zIndex: index + 1 }}
                >
                  <SourceAvatar source={source} size="xs" />
                </div>
              ))}
              {enabledSources.length > 3 && (
                <div
                  className="-ml-1 h-5 w-5 rounded-[5px] bg-background shadow-minimal flex items-center justify-center text-[9px] font-medium text-muted-foreground"
                  style={{ zIndex: 4 }}
                >
                  +{enabledSources.length - 3}
                </div>
              )}
            </div>
          )}
          <span className="text-foreground/70">
            {enabledSources.length === 0 ? 'Sources' : `${enabledSources.length}`}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-[320px] p-0 bg-background/90 backdrop-blur-xl border-border/50"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2 border-b border-foreground/5">
          <div className="flex items-center gap-2 px-2 h-9 rounded-[8px] bg-foreground/[0.03]">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sources…"
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground/60"
            />
          </div>
        </div>
        <ScrollArea className="h-[280px]">
          <div className="p-1">
            {filtered.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">No sources found</div>
            ) : (
              filtered.map((source) => {
                const isEnabled = enabledSet.has(source.config.slug)
                return (
                  <button
                    key={source.config.slug}
                    type="button"
                    onClick={() => {
                      const next = isEnabled
                        ? enabledSourceSlugs.filter(s => s !== source.config.slug)
                        : [...enabledSourceSlugs, source.config.slug]
                      onChange(next)
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 rounded-[8px] text-left transition-colors",
                      "hover:bg-foreground/[0.04]"
                    )}
                  >
                    <div className="shrink-0 h-6 w-6 rounded-[6px] bg-background shadow-minimal flex items-center justify-center">
                      <SourceAvatar source={source} size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{source.config.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{source.config.slug}</div>
                    </div>
                    <div className={cn("shrink-0 h-5 w-5 rounded-full flex items-center justify-center", isEnabled ? "bg-foreground text-background" : "opacity-0")}>
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

