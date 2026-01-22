/**
 * CraftBrowser - Browse Craft folders and documents
 *
 * Shows a tree view of folders and documents from Craft
 */

import * as React from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Folder, FileText, ChevronRight, ChevronDown, Loader2, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CraftFolder {
  id: string
  name: string
  documentCount: number
  type: 'folder' | 'location'
  icon?: string
}

interface CraftDocument {
  id: string
  name: string
  updatedAt: string
  folderId: string
}

export interface CraftBrowserProps {
  workspaceId: string
  selectedDocumentId?: string
  onSelectDocument: (documentId: string) => void
}

export function CraftBrowser({
  workspaceId,
  selectedDocumentId,
  onSelectDocument,
}: CraftBrowserProps) {
  const [folders, setFolders] = React.useState<CraftFolder[]>([])
  const [documents, setDocuments] = React.useState<Record<string, CraftDocument[]>>({})
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set())
  const [loadingFolders, setLoadingFolders] = React.useState<Set<string>>(new Set())
  const [isLoadingFolders, setIsLoadingFolders] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Find Craft source
  const craftSourceSlug = 'craft-all-docs' // TODO: Get from sources context

  // Load folders on mount
  React.useEffect(() => {
    loadFolders()
  }, [workspaceId])

  async function loadFolders() {
    setIsLoadingFolders(true)
    setError(null)

    try {
      console.log('[CraftBrowser] Loading folders...')

      const response = await window.electronAPI.callMcpTool(
        workspaceId,
        craftSourceSlug,
        'folders_list',
        {}
      )

      console.log('[CraftBrowser] Folders response:', response)

      if (!response.success) {
        setError(response.error || 'Failed to load folders')
        return
      }

      // Parse response
      const result = response.result as any
      let folderList: any[] = []

      if (Array.isArray(result)) {
        folderList = result
      } else if (result.content && Array.isArray(result.content)) {
        const firstContent = result.content[0]
        if (firstContent && typeof firstContent.text === 'string') {
          try {
            const parsed = JSON.parse(firstContent.text)
            folderList = Array.isArray(parsed) ? parsed : []
          } catch (err) {
            console.error('[CraftBrowser] Failed to parse folders:', err)
          }
        }
      }

      // Ensure folderList is an array before mapping
      if (!Array.isArray(folderList)) {
        console.error('[CraftBrowser] folderList is not an array:', folderList)
        folderList = []
      }

      const mapped: CraftFolder[] = folderList.map((f: any) => ({
        id: f.id || f.spaceId || Math.random().toString(),
        name: f.name || f.label || 'Unnamed',
        documentCount: f.documentCount || f.count || 0,
        type: f.type || 'folder',
        icon: f.icon,
      }))

      console.log('[CraftBrowser] Mapped folders:', mapped)
      setFolders(mapped)
    } catch (err) {
      console.error('[CraftBrowser] Error loading folders:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsLoadingFolders(false)
    }
  }

  async function loadDocuments(folderId: string) {
    setLoadingFolders(prev => new Set(prev).add(folderId))

    try {
      console.log('[CraftBrowser] Loading documents for folder:', folderId)

      const response = await window.electronAPI.callMcpTool(
        workspaceId,
        craftSourceSlug,
        'documents_list',
        { folderId, limit: 50 }
      )

      console.log('[CraftBrowser] Documents response:', response)

      if (!response.success) {
        console.error('[CraftBrowser] Failed to load documents:', response.error)
        return
      }

      // Parse response
      const result = response.result as any
      let docList: any[] = []

      if (Array.isArray(result)) {
        docList = result
      } else if (result.content && Array.isArray(result.content)) {
        const firstContent = result.content[0]
        if (firstContent && typeof firstContent.text === 'string') {
          try {
            docList = JSON.parse(firstContent.text)
          } catch (err) {
            console.error('[CraftBrowser] Failed to parse documents:', err)
          }
        }
      }

      const mapped: CraftDocument[] = docList.map((d: any) => ({
        id: d.id || d.documentId || Math.random().toString(),
        name: d.title || d.name || 'Untitled',
        updatedAt: d.updatedAt || d.modifiedAt || new Date().toISOString(),
        folderId,
      }))

      console.log('[CraftBrowser] Mapped documents:', mapped)

      setDocuments(prev => ({
        ...prev,
        [folderId]: mapped,
      }))
    } catch (err) {
      console.error('[CraftBrowser] Error loading documents:', err)
    } finally {
      setLoadingFolders(prev => {
        const next = new Set(prev)
        next.delete(folderId)
        return next
      })
    }
  }

  function toggleFolder(folderId: string) {
    const isExpanded = expandedFolders.has(folderId)

    if (isExpanded) {
      // Collapse
      setExpandedFolders(prev => {
        const next = new Set(prev)
        next.delete(folderId)
        return next
      })
    } else {
      // Expand and load documents if not already loaded
      setExpandedFolders(prev => new Set(prev).add(folderId))
      if (!documents[folderId]) {
        loadDocuments(folderId)
      }
    }
  }

  if (isLoadingFolders) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm">Loading folders...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4">
        <p className="text-sm text-destructive mb-4">{error}</p>
        <button
          onClick={loadFolders}
          className="text-sm text-primary hover:underline flex items-center gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </button>
      </div>
    )
  }

  return (
    <ScrollArea className="h-full">
      <div className="p-2">
        {folders.map(folder => (
          <div key={folder.id} className="mb-1">
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(folder.id)}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left",
                expandedFolders.has(folder.id) && "bg-accent/30"
              )}
            >
              {loadingFolders.has(folder.id) ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin flex-shrink-0 text-muted-foreground" />
              ) : expandedFolders.has(folder.id) ? (
                <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              )}
              <Folder className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
              <span className="text-sm flex-1 truncate">{folder.name}</span>
              <span className="text-xs text-muted-foreground">{folder.documentCount}</span>
            </button>

            {/* Documents list */}
            {expandedFolders.has(folder.id) && documents[folder.id] && (
              <div className="ml-6 mt-1">
                {documents[folder.id].map(doc => (
                  <button
                    key={doc.id}
                    onClick={() => onSelectDocument(doc.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left",
                      selectedDocumentId === doc.id && "bg-primary/10"
                    )}
                  >
                    <FileText className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                    <span className="text-sm flex-1 truncate">{doc.name}</span>
                  </button>
                ))}

                {documents[folder.id].length === 0 && (
                  <div className="px-2 py-1.5 text-xs text-muted-foreground">
                    No documents
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {folders.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            <p className="text-sm">No folders found</p>
          </div>
        )}
      </div>
    </ScrollArea>
  )
}
