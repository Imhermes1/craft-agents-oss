/**
 * CraftDocumentViewer - Document viewer/editor for Craft documents
 *
 * Displays and edits Craft documents using the Craft MCP tools.
 * Aims to replicate the Craft app experience as closely as possible.
 */

import * as React from 'react'
import { Panel } from './Panel'
import { PanelHeader } from './PanelHeader'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Loader2, FileText, ChevronRight } from 'lucide-react'

interface CraftBlock {
  id: string
  type: 'text' | 'heading' | 'code' | 'quote' | 'list' | 'todo'
  content: string
  level?: number // For headings
  checked?: boolean // For todos
  indentLevel?: number
  subBlocks?: CraftBlock[]
}

interface CraftDocument {
  id: string
  title: string
  blocks: CraftBlock[]
  updatedAt: string
  folderPath?: string[]
}

export interface CraftDocumentViewerProps {
  documentId: string
  workspaceId: string
  onBack?: () => void
}

export function CraftDocumentViewer({
  documentId,
  workspaceId,
  onBack,
}: CraftDocumentViewerProps) {
  const [document, setDocument] = React.useState<CraftDocument | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Load document from Craft MCP
  React.useEffect(() => {
    async function loadDocument() {
      setIsLoading(true)
      setError(null)

      try {
        console.log('[CraftViewer] Loading document:', documentId)

        // Find Craft source
        // TODO: Get this from context/props
        const craftSourceSlug = 'craft-all-docs' // or from sources list

        // Call blocks_get to get document content
        const response = await window.electronAPI.callMcpTool(
          workspaceId,
          craftSourceSlug,
          'blocks_get',
          { id: documentId }
        )

        console.log('[CraftViewer] Document response:', response)

        if (!response.success) {
          setError(response.error || 'Failed to load document')
          return
        }

        // Parse the response
        const result = response.result as any
        let blocks: any[] = []

        if (Array.isArray(result)) {
          blocks = result
        } else if (result.content && Array.isArray(result.content)) {
          const firstContent = result.content[0]
          if (firstContent && typeof firstContent.text === 'string') {
            try {
              blocks = JSON.parse(firstContent.text)
            } catch (err) {
              console.error('[CraftViewer] Failed to parse blocks:', err)
            }
          }
        }

        // Transform to CraftDocument format
        const doc: CraftDocument = {
          id: documentId,
          title: blocks.find(b => b.type === 'title')?.content || 'Untitled',
          blocks: blocks.filter(b => b.type !== 'title').map(transformBlock),
          updatedAt: new Date().toISOString(),
        }

        setDocument(doc)
      } catch (err) {
        console.error('[CraftViewer] Error loading document:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setIsLoading(false)
      }
    }

    loadDocument()
  }, [documentId, workspaceId])

  // Transform Craft API block to our format
  function transformBlock(block: any): CraftBlock {
    return {
      id: block.id || Math.random().toString(),
      type: block.type || 'text',
      content: block.content || block.text || '',
      level: block.level,
      checked: block.checked,
      indentLevel: block.indentLevel || 0,
      subBlocks: block.subBlocks?.map(transformBlock),
    }
  }

  // Render a single block
  function renderBlock(block: CraftBlock, index: number) {
    const className = 'px-4 py-1 hover:bg-accent/5 cursor-text transition-colors'
    const style = { paddingLeft: `${(block.indentLevel || 0) * 24 + 16}px` }

    switch (block.type) {
      case 'heading':
        const HeadingTag = `h${block.level || 1}` as keyof JSX.IntrinsicElements
        const headingClass = block.level === 1 ? 'text-2xl font-bold' : block.level === 2 ? 'text-xl font-semibold' : 'text-lg font-medium'
        return (
          <div key={block.id} className={className} style={style}>
            <HeadingTag className={headingClass}>{block.content}</HeadingTag>
          </div>
        )

      case 'code':
        return (
          <div key={block.id} className={className} style={style}>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto">
              <code className="text-sm font-mono">{block.content}</code>
            </pre>
          </div>
        )

      case 'quote':
        return (
          <div key={block.id} className={className} style={style}>
            <blockquote className="border-l-4 border-accent pl-4 italic text-muted-foreground">
              {block.content}
            </blockquote>
          </div>
        )

      case 'todo':
        return (
          <div key={block.id} className={`${className} flex items-start gap-2`} style={style}>
            <input
              type="checkbox"
              checked={block.checked || false}
              className="mt-1"
              onChange={() => {/* TODO: Update block */}}
            />
            <span className={block.checked ? 'line-through text-muted-foreground' : ''}>
              {block.content}
            </span>
          </div>
        )

      case 'list':
        return (
          <div key={block.id} className={`${className} flex items-start gap-2`} style={style}>
            <span className="select-none">•</span>
            <span>{block.content}</span>
          </div>
        )

      case 'text':
      default:
        return (
          <div key={block.id} className={className} style={style}>
            <p className="leading-relaxed">{block.content}</p>
          </div>
        )
    }
  }

  if (isLoading) {
    return (
      <Panel variant="grow" className="flex items-center justify-center">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Loading document...</p>
        </div>
      </Panel>
    )
  }

  if (error) {
    return (
      <Panel variant="grow">
        <PanelHeader
          title="Error"
          onBack={onBack}
        />
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </Panel>
    )
  }

  if (!document) {
    return (
      <Panel variant="grow">
        <PanelHeader
          title="Not Found"
          onBack={onBack}
        />
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Document not found</p>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <Panel variant="grow" className="flex flex-col">
      <PanelHeader
        title={document.title}
        subtitle={document.folderPath?.join(' / ')}
        onBack={onBack}
      />

      <ScrollArea className="flex-1">
        <div className="max-w-4xl mx-auto py-8">
          {/* Document Title */}
          <div className="px-4 mb-8">
            <h1 className="text-4xl font-bold mb-2 outline-none" contentEditable suppressContentEditableWarning>
              {document.title}
            </h1>
            <p className="text-sm text-muted-foreground">
              Last updated {new Date(document.updatedAt).toLocaleDateString()}
            </p>
          </div>

          {/* Document Blocks */}
          <div className="space-y-0">
            {document.blocks.map((block, index) => renderBlock(block, index))}
          </div>

          {/* Empty state if no blocks */}
          {document.blocks.length === 0 && (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <p className="text-sm">This document is empty. Start typing to add content...</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </Panel>
  )
}
