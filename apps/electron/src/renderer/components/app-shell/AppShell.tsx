import * as React from "react"
import { useRef, useState, useEffect, useCallback, useMemo } from "react"
import { useAtomValue } from "jotai"
import { motion, AnimatePresence } from "motion/react"
import {
  CheckCircle2,
  Settings,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  RotateCw,
  Flag,
  ListFilter,
  Check,
  Search,
  Plus,
  Trash2,
  DatabaseZap,
  Zap,
  Inbox,
  Globe,
  FolderOpen,
  HelpCircle,
  ExternalLink,
} from "lucide-react"
import { PanelRightRounded } from "../icons/PanelRightRounded"
import { PanelLeftRounded } from "../icons/PanelLeftRounded"
// TodoStateIcons no longer used - icons come from dynamic todoStates
import { SourceAvatar } from "@/components/ui/source-avatar"
import { AppMenu } from "../AppMenu"
import { SquarePenRounded } from "../icons/SquarePenRounded"
import { McpIcon } from "../icons/McpIcon"
import { cn, isHexColor } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { HeaderIconButton } from "@/components/ui/HeaderIconButton"
import { Separator } from "@/components/ui/separator"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  StyledDropdownMenuContent,
  StyledDropdownMenuItem,
  StyledDropdownMenuSeparator,
} from "@/components/ui/styled-dropdown"
import {
  ContextMenu,
  ContextMenuTrigger,
  StyledContextMenuContent,
} from "@/components/ui/styled-context-menu"
import { ContextMenuProvider } from "@/components/ui/menu-context"
import { SidebarMenu } from "./SidebarMenu"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FadingText } from "@/components/ui/fading-text"
import {
  Collapsible,
  CollapsibleTrigger,
  AnimatedCollapsibleContent,
  springTransition as collapsibleSpring,
} from "@/components/ui/collapsible"
import { WorkspaceSwitcher } from "./WorkspaceSwitcher"
import { SessionList } from "./SessionList"
import { MainContentPanel } from "./MainContentPanel"
import { LeftSidebar } from "./LeftSidebar"
import { ModeToggle, type AppMode } from "./ModeToggle"
import { useSession } from "@/hooks/useSession"
import { ensureSessionMessagesLoadedAtom } from "@/atoms/sessions"
import { AppShellProvider, type AppShellContextType } from "@/context/AppShellContext"
import { EscapeInterruptProvider, useEscapeInterrupt } from "@/context/EscapeInterruptContext"
import { useTheme } from "@/context/ThemeContext"
import { getResizeGradientStyle } from "@/hooks/useResizeGradient"
import { useFocusZone, useGlobalShortcuts } from "@/hooks/keyboard"
import { useFocusContext } from "@/context/FocusContext"
import { getSessionTitle } from "@/utils/session"
import { useSetAtom } from "jotai"
import type { Session, Workspace, FileAttachment, PermissionRequest, TodoState, LoadedSource, LoadedSkill, PermissionMode, SourceFilter } from "../../../shared/types"
import { sessionMetaMapAtom, type SessionMeta } from "@/atoms/sessions"
import { sourcesAtom } from "@/atoms/sources"
import { skillsAtom } from "@/atoms/skills"
import { type TodoStateId, statusConfigsToTodoStates } from "@/config/todo-states"
import { useStatuses } from "@/hooks/useStatuses"
import * as storage from "@/lib/local-storage"
import { toast } from "sonner"
import { navigate, routes } from "@/lib/navigate"
import {
  useNavigation,
  useNavigationState,
  isChatsNavigation,
  isChatNavigation,
  isSourcesNavigation,
  isSettingsNavigation,
  isSkillsNavigation,
  type NavigationState,
  type ChatFilter,
} from "@/contexts/NavigationContext"
import type { SettingsSubpage } from "../../../shared/types"
import { SourcesListPanel } from "./SourcesListPanel"
import { SkillsListPanel } from "./SkillsListPanel"
import { PanelHeader } from "./PanelHeader"
import { EditPopover, getEditConfig } from "@/components/ui/EditPopover"
import { getDocUrl } from "@craft-agent/shared/docs/doc-links"
import SettingsNavigator from "@/pages/settings/SettingsNavigator"
import { RightSidebar } from "./RightSidebar"
import type { RichTextInputHandle } from "@/components/ui/rich-text-input"
import { hasOpenOverlay } from "@/lib/overlay-detection"

/**
 * AppShellProps - Minimal props interface for AppShell component
 *
 * Data and callbacks come via contextValue (AppShellContextType).
 * Only UI-specific state is passed as separate props.
 *
 * Adding new features:
 * 1. Add to AppShellContextType in context/AppShellContext.tsx
 * 2. Update App.tsx to include in contextValue
 * 3. Use via useAppShellContext() hook in child components
 */
interface AppShellProps {
  /** All data and callbacks - passed directly to AppShellProvider */
  contextValue: AppShellContextType
  /** UI-specific props */
  defaultLayout?: number[]
  defaultCollapsed?: boolean
  menuNewChatTrigger?: number
  /** Focused mode - hides sidebars, shows only the chat content */
  isFocusedMode?: boolean
}

/**
 * Panel spacing constants (in pixels)
 */
const PANEL_WINDOW_EDGE_SPACING = 6 // Padding between panels and window edge
const PANEL_PANEL_SPACING = 5 // Gap between adjacent panels

/**
 * AppShell - Main 3-panel layout container
 *
 * Layout: [LeftSidebar 20%] | [NavigatorPanel 32%] | [MainContentPanel 48%]
 *
 * Chat Filters:
 * - 'allChats': Shows all sessions
 * - 'flagged': Shows flagged sessions
 * - 'state': Shows sessions with a specific todo state
 */
export function AppShell(props: AppShellProps) {
  // Wrap with EscapeInterruptProvider so AppShellContent can use useEscapeInterrupt
  return (
    <EscapeInterruptProvider>
      <AppShellContent {...props} />
    </EscapeInterruptProvider>
  )
}

/**
 * AppShellContent - Inner component that contains all the AppShell logic
 * Separated to allow useEscapeInterrupt hook to work (must be inside provider)
 */
function AppShellContent({
  contextValue,
  defaultLayout = [20, 32, 48],
  defaultCollapsed = false,
  menuNewChatTrigger,
  isFocusedMode = false,
}: AppShellProps) {
  // Destructure commonly used values from context
  // Note: sessions is NOT destructured here - we use sessionMetaMapAtom instead
  // to prevent closures from retaining the full messages array
  const {
    workspaces,
    activeWorkspaceId,
    currentModel,
    sessionOptions,
    onSelectWorkspace,
    onRefreshWorkspaces,
    onCreateSession,
    onDeleteSession,
    onFlagSession,
    onUnflagSession,
    onMarkSessionRead,
    onMarkSessionUnread,
    onTodoStateChange,
    onRenameSession,
    onOpenSettings,
    onOpenKeyboardShortcuts,
    onOpenStoredUserPreferences,
    onReset,
    onSendMessage,
    openNewChat,
  } = contextValue

  const [isSidebarVisible, setIsSidebarVisible] = React.useState(() => {
    return storage.get(storage.KEYS.sidebarVisible, !defaultCollapsed)
  })
  const [sidebarWidth, setSidebarWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sidebarWidth, 220)
  })
  // Session list width in pixels (min 240, max 480)
  const [sessionListWidth, setSessionListWidth] = React.useState(() => {
    return storage.get(storage.KEYS.sessionListWidth, 300)
  })

  // Right sidebar state (min 280, max 480)
  const [isRightSidebarVisible, setIsRightSidebarVisible] = React.useState(() => {
    return storage.get(storage.KEYS.rightSidebarVisible, false)
  })
  const [rightSidebarWidth, setRightSidebarWidth] = React.useState(() => {
    return storage.get(storage.KEYS.rightSidebarWidth, 300)
  })
  const [skipRightSidebarAnimation, setSkipRightSidebarAnimation] = React.useState(false)

  // Window width tracking for responsive behavior
  const [windowWidth, setWindowWidth] = React.useState(window.innerWidth)

  // App mode toggle (agent vs chat)
  // Agent mode is default to preserve original app experience
  const [appMode, setAppMode] = React.useState<AppMode>(() => {
    return storage.get(storage.KEYS.appMode, 'agent') as AppMode
  })

  // Calculate overlay threshold dynamically based on actual sidebar widths
  // Formula: 600px (300px right sidebar + 300px center) + leftSidebar + sessionList
  // This ensures we switch to overlay mode when inline right sidebar would compress content
  const MIN_INLINE_SPACE = 600 // 300px for right sidebar + 300px for center content
  const leftSidebarEffectiveWidth = isSidebarVisible ? sidebarWidth : 0
  const OVERLAY_THRESHOLD = MIN_INLINE_SPACE + leftSidebarEffectiveWidth + sessionListWidth
  const shouldUseOverlay = windowWidth < OVERLAY_THRESHOLD

  const [isResizing, setIsResizing] = React.useState<'sidebar' | 'session-list' | 'right-sidebar' | null>(null)
  const [sidebarHandleY, setSidebarHandleY] = React.useState<number | null>(null)
  const [sessionListHandleY, setSessionListHandleY] = React.useState<number | null>(null)
  const [rightSidebarHandleY, setRightSidebarHandleY] = React.useState<number | null>(null)
  const resizeHandleRef = React.useRef<HTMLDivElement>(null)
  const sessionListHandleRef = React.useRef<HTMLDivElement>(null)
  const rightSidebarHandleRef = React.useRef<HTMLDivElement>(null)
  const [session, setSession] = useSession()
  const { resolvedMode } = useTheme()
  const { canGoBack, canGoForward, goBack, goForward } = useNavigation()

  // Double-Esc interrupt feature: first Esc shows warning, second Esc interrupts
  const { handleEscapePress } = useEscapeInterrupt()

  // UNIFIED NAVIGATION STATE - single source of truth from NavigationContext
  // All sidebar/navigator/main panel state is derived from this
  const navState = useNavigationState()

  // Derive chat filter from navigation state (for both agent mode and chat mode)
  const chatFilter = isChatsNavigation(navState)
    ? navState.filter
    : isChatNavigation(navState)
      ? { kind: 'allChats' as const } // Chat mode defaults to showing all chats
      : null

  // Derive source filter from navigation state (only when in sources navigator)
  const sourceFilter: SourceFilter | null = isSourcesNavigation(navState) ? navState.filter ?? null : null

  // Session list filter: empty set shows all, otherwise shows only sessions with selected states
  const [listFilter, setListFilter] = React.useState<Set<TodoStateId>>(() => {
    const saved = storage.get<TodoStateId[]>(storage.KEYS.listFilter, [])
    return new Set(saved)
  })
  // Search state for session list
  const [searchActive, setSearchActive] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')

  // Reset search only when navigator or filter changes (not when selecting sessions)
  const navFilterKey = React.useMemo(() => {
    if (isChatsNavigation(navState)) {
      const filter = navState.filter
      return `chats:${filter.kind}:${filter.kind === 'state' ? filter.stateId : ''}`
    }
    return navState.navigator
  }, [navState])

  React.useEffect(() => {
    setSearchActive(false)
    setSearchQuery('')
  }, [navFilterKey])

  // Auto-hide right sidebar when navigating away from chat sessions
  React.useEffect(() => {
    // Hide sidebar if not in any chat view or no session selected
    const isAnyChat = isChatsNavigation(navState) || isChatNavigation(navState)
    if (!isAnyChat || !navState.details) {
      setSkipRightSidebarAnimation(true)
      setIsRightSidebarVisible(false)
      // Reset skip flag after state update
      setTimeout(() => setSkipRightSidebarAnimation(false), 0)
    }
  }, [navState])

  // Cmd+F to activate search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault()
        setSearchActive(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Track window width for responsive right sidebar behavior
  React.useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Unified sidebar keyboard navigation state
  // Load expanded folders from localStorage (default: all collapsed)
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(() => {
    const saved = storage.get<string[]>(storage.KEYS.expandedFolders, [])
    return new Set(saved)
  })

  // Sync expandedFolders to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.expandedFolders, [...expandedFolders])
  }, [expandedFolders])

  const handleToggleFolder = React.useCallback((path: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const [focusedSidebarItemId, setFocusedSidebarItemId] = React.useState<string | null>(null)
  const sidebarItemRefs = React.useRef<Map<string, HTMLElement>>(new Map())
  // Track which expandable sidebar items are collapsed (default: all expanded)
  const [collapsedItems, setCollapsedItems] = React.useState<Set<string>>(() => {
    const saved = storage.get<string[]>(storage.KEYS.collapsedSidebarItems, [])
    return new Set(saved)
  })
  const isExpanded = React.useCallback((id: string) => !collapsedItems.has(id), [collapsedItems])
  const toggleExpanded = React.useCallback((id: string) => {
    setCollapsedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  // Sources state (workspace-scoped)
  const [sources, setSources] = React.useState<LoadedSource[]>([])

  // Widgets State
  const [reminders, setReminders] = React.useState<{ id: string; title: string; dueDate?: string; isOverdue?: boolean; completed?: boolean }[]>([])
  const [starredDocs, setStarredDocs] = React.useState<{ id: string; title: string; updatedAt: string; url?: string }[]>([])
  const [isRefreshingReminders, setIsRefreshingReminders] = React.useState(false)
  const [isRefreshingStarred, setIsRefreshingStarred] = React.useState(false)

  const fetchReminders = React.useCallback(async () => {
    console.log('[Reminders] Fetching Apple Reminders using native AppleScript')
    setIsRefreshingReminders(true)
    try {
      const response = await Promise.race([
        window.electronAPI.getAppleReminders(),
        new Promise<{ success: false; error: string }>((resolve) =>
          setTimeout(() => resolve({ success: false, error: 'Timeout' }), 5000)
        )
      ])

      console.log('[Reminders] AppleScript response:', response)

      if (!response.success) {
        console.error('[Reminders] AppleScript call failed:', response.error)
        setReminders([])
        return
      }

      if (!response.reminders || !Array.isArray(response.reminders)) {
        console.log('[Reminders] No reminders in response')
        setReminders([])
        return
      }

      console.log('[Reminders] Raw reminders:', response.reminders)

      const reminders = response.reminders.map((r: any) => ({
        id: r.id || r.name || Math.random().toString(),
        title: r.name || r.title || 'Untitled',
        dueDate: r.dueDate || null,
        isOverdue: r.dueDate ? new Date(r.dueDate) < new Date() : false,
        completed: r.completed || false
      }))

      console.log('[Reminders] Mapped reminders:', reminders)
      setReminders(reminders)
    } catch (error) {
      console.error('[Reminders] Failed to fetch reminders:', error)
      setReminders([])
    } finally {
      setIsRefreshingReminders(false)
    }
  }, [])

  const toggleReminder = React.useCallback(async (reminderId: string, title?: string) => {
    try {
      console.log('[Reminders] Completing reminder:', title || reminderId)

      const response = await window.electronAPI.completeAppleReminder(title || reminderId)

      if (!response.success) {
        console.error('[Reminders] Failed to complete reminder:', response.error)
        toast.error('Failed to complete reminder')
        return
      }

      toast.success('Reminder completed')
      fetchReminders()
    } catch (error) {
      console.error('[Reminders] Failed to complete reminder:', error)
      toast.error('Failed to complete reminder')
    }
  }, [fetchReminders])

  const fetchStarredDocs = React.useCallback(async () => {
    if (!activeWorkspaceId) {
      console.log('[Starred Docs] No active workspace ID')
      return
    }

    console.log('[Starred Docs] Looking for Craft source in:', sources.map(s => ({
      slug: s.config.slug,
      provider: s.config.provider,
      status: s.config.connectionStatus
    })))

    const source = sources.find(s => s.config.slug === 'craft-all-docs' || s.config.provider === 'craft')
    if (!source) {
      console.log('[Starred Docs] No Craft source found')
      return
    }

    if (source.config.connectionStatus !== 'connected') {
      console.log('[Starred Docs] Craft source not connected, status:', source.config.connectionStatus)
      return
    }

    console.log('[Starred Docs] Fetching from source:', source.config.slug)
    setIsRefreshingStarred(true)
    try {
      // Step 1: Get all folders/locations to find the Starred folder
      console.log('[Starred Docs] Calling folders_list...')
      const foldersResponse = await window.electronAPI.callMcpTool(activeWorkspaceId, source.config.slug, 'folders_list', {})

      console.log('[Starred Docs] folders_list response:', foldersResponse)

      if (!foldersResponse.success) {
        console.error('[Starred Docs] folders_list failed:', foldersResponse.error)
        return
      }

      // Parse folders response to find Starred location
      const foldersResult = foldersResponse.result as any
      let folders: any[] = []

      if (Array.isArray(foldersResult)) {
        folders = foldersResult
      } else if (foldersResult.content && Array.isArray(foldersResult.content)) {
        const firstContent = foldersResult.content[0]
        if (firstContent && typeof firstContent.text === 'string') {
          try {
            const parsed = JSON.parse(firstContent.text)
            folders = Array.isArray(parsed) ? parsed : [parsed]
          } catch (err) {
            console.error('[Starred Docs] Failed to parse folders JSON:', err)
          }
        }
      }

      console.log('[Starred Docs] Parsed folders:', folders)

      // Find the Starred folder (might be called "Starred", "starred", or have a special ID)
      const starredFolder = folders.find(f =>
        (f.name && f.name.toLowerCase() === 'starred') ||
        (f.label && f.label.toLowerCase() === 'starred') ||
        (f.id && f.id.toLowerCase().includes('starred'))
      )

      if (!starredFolder) {
        console.log('[Starred Docs] Starred folder not found in:', folders)
        setStarredDocs([])
        return
      }

      console.log('[Starred Docs] Found starred folder:', starredFolder)

      // Step 2: Get documents in the Starred folder
      console.log('[Starred Docs] Calling documents_list with folder:', starredFolder.id)
      const response = await window.electronAPI.callMcpTool(activeWorkspaceId, source.config.slug, 'documents_list', {
        folderId: starredFolder.id,
        limit: 10
      })

      console.log('[Starred Docs] MCP response:', response)

      if (!response.success) {
        console.error('[Starred Docs] MCP call failed:', response.error)
        return
      }

      if (!response.result) {
        console.log('[Starred Docs] No result in response')
        return
      }

      const result = response.result as any
      console.log('[Starred Docs] Result type:', typeof result, 'Is array:', Array.isArray(result))
      console.log('[Starred Docs] Result structure:', JSON.stringify(result, null, 2))

      // MCP tool results typically have format: { content: [{ type: "text", text: "..." }] }
      // But some tools might return data directly
      let list: any[] = []

      // Case 1: Result is already an array of documents
      if (Array.isArray(result)) {
        console.log('[Starred Docs] Result is array, using directly')
        list = result
      }
      // Case 2: Result has content array (standard MCP format)
      else if (result.content && Array.isArray(result.content)) {
        console.log('[Starred Docs] Result has content array')
        const firstContent = result.content[0]

        // Check if content has text that needs to be parsed as JSON
        if (firstContent && typeof firstContent.text === 'string') {
          console.log('[Starred Docs] Found text content:', firstContent.text.substring(0, 200))
          try {
            const parsed = JSON.parse(firstContent.text)
            list = Array.isArray(parsed) ? parsed : [parsed]
            console.log('[Starred Docs] Successfully parsed JSON from text')
          } catch (err) {
            console.error('[Starred Docs] Failed to parse JSON:', err)
            // If it's not JSON, treat the text as a single item
            list = [{ title: firstContent.text }]
          }
        } else {
          // Content doesn't have text, use content array as-is
          console.log('[Starred Docs] Using content array as-is')
          list = result.content
        }
      }
      // Case 3: Result is a single object (wrap in array)
      else if (typeof result === 'object') {
        console.log('[Starred Docs] Result is object, wrapping in array')
        list = [result]
      }

      console.log('[Starred Docs] Final list length:', list.length)
      console.log('[Starred Docs] Final list:', JSON.stringify(list, null, 2))

      if (Array.isArray(list) && list.length > 0) {
        const docs = list.map((d: any) => ({
          id: d.id || d.documentId || d.name || Math.random().toString(),
          title: d.title || d.name || d.documentName || String(d),
          updatedAt: d.updatedAt || d.modifiedAt || d.updated_at,
          url: d.url || d.deeplink || d.webUrl
        }))
        console.log('[Starred Docs] Mapped docs:', docs)
        setStarredDocs(docs)
      } else {
        console.log('[Starred Docs] No valid documents found in response')
        setStarredDocs([])
      }
    } catch (error) {
      console.error('[Starred Docs] Failed to fetch starred docs:', error)
    } finally {
      setIsRefreshingStarred(false)
    }
  }, [sources, activeWorkspaceId])

  React.useEffect(() => {
    if (appMode === 'chat') {
      // TODO: Re-enable when AppleScript permissions are resolved
      // fetchReminders()
      fetchStarredDocs()
    }
  }, [appMode, fetchReminders, fetchStarredDocs])
  // Sync sources to atom for NavigationContext auto-selection
  const setSourcesAtom = useSetAtom(sourcesAtom)
  React.useEffect(() => {
    setSourcesAtom(sources)
  }, [sources, setSourcesAtom])

  // Skills state (workspace-scoped)
  const [skills, setSkills] = React.useState<LoadedSkill[]>([])
  // Sync skills to atom for NavigationContext auto-selection
  const setSkillsAtom = useSetAtom(skillsAtom)
  React.useEffect(() => {
    setSkillsAtom(skills)
  }, [skills, setSkillsAtom])
  // Whether local MCP servers are enabled (affects stdio source status)
  const [localMcpEnabled, setLocalMcpEnabled] = React.useState(true)

  // Enabled permission modes for Shift+Tab cycling (min 2 modes)
  const [enabledModes, setEnabledModes] = React.useState<PermissionMode[]>(['safe', 'ask', 'allow-all'])

  // Load workspace settings (for localMcpEnabled and cyclablePermissionModes) on workspace change
  React.useEffect(() => {
    if (!activeWorkspaceId) return
    window.electronAPI.getWorkspaceSettings(activeWorkspaceId).then((settings) => {
      if (settings) {
        setLocalMcpEnabled(settings.localMcpEnabled ?? true)
        // Load cyclablePermissionModes from workspace settings
        if (settings.cyclablePermissionModes && settings.cyclablePermissionModes.length >= 2) {
          setEnabledModes(settings.cyclablePermissionModes)
        }
      }
    }).catch((err) => {
      console.error('[Chat] Failed to load workspace settings:', err)
    })
  }, [activeWorkspaceId])

  // Load sources from backend on mount
  React.useEffect(() => {
    if (!activeWorkspaceId) return
    window.electronAPI.getSources(activeWorkspaceId).then((loaded) => {
      setSources(loaded || [])
    }).catch(err => {
      console.error('[Chat] Failed to load sources:', err)
    })
  }, [activeWorkspaceId])

  // Subscribe to live source updates (when sources are added/removed dynamically)
  React.useEffect(() => {
    const cleanup = window.electronAPI.onSourcesChanged((updatedSources) => {
      setSources(updatedSources || [])
    })
    return cleanup
  }, [])

  // Load skills from backend on mount
  React.useEffect(() => {
    if (!activeWorkspaceId) return
    window.electronAPI.getSkills(activeWorkspaceId).then((loaded) => {
      setSkills(loaded || [])
    }).catch(err => {
      console.error('[Chat] Failed to load skills:', err)
    })
  }, [activeWorkspaceId])

  // Subscribe to live skill updates (when skills are added/removed dynamically)
  React.useEffect(() => {
    const cleanup = window.electronAPI.onSkillsChanged?.((updatedSkills) => {
      setSkills(updatedSkills || [])
    })
    return cleanup
  }, [])

  // Handle session source selection changes
  const handleSessionSourcesChange = React.useCallback(async (sessionId: string, sourceSlugs: string[]) => {
    try {
      await window.electronAPI.sessionCommand(sessionId, { type: 'setSources', sourceSlugs })
      // Session will emit a 'sources_changed' event that updates the session state
    } catch (err) {
      console.error('[Chat] Failed to set session sources:', err)
    }
  }, [])

  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId)

  // Load dynamic statuses from workspace config
  const { statuses: statusConfigs, isLoading: isLoadingStatuses } = useStatuses(activeWorkspace?.id || null)
  const [todoStates, setTodoStates] = React.useState<Array<{
    id: string
    label: string
    color: string
    icon: React.ReactNode
    iconColorable: boolean
    category?: 'open' | 'closed'
    isFixed?: boolean
    isDefault?: boolean
    shortcut?: string
  }>>([])

  // Convert StatusConfig to TodoState with resolved icons
  React.useEffect(() => {
    if (!activeWorkspace?.id || statusConfigs.length === 0) {
      setTodoStates([])
      return
    }

    statusConfigsToTodoStates(statusConfigs, activeWorkspace.id).then(setTodoStates)
  }, [statusConfigs, activeWorkspace?.id])

  // Ensure session messages are loaded when selected
  const ensureMessagesLoaded = useSetAtom(ensureSessionMessagesLoadedAtom)

  // Handle selecting a source from the list
  const handleSourceSelect = React.useCallback((source: LoadedSource) => {
    if (!activeWorkspaceId) return
    navigate(routes.view.sources({ sourceSlug: source.config.slug }))
  }, [activeWorkspaceId, navigate])

  // Handle selecting a skill from the list
  const handleSkillSelect = React.useCallback((skill: LoadedSkill) => {
    if (!activeWorkspaceId) return
    navigate(routes.view.skills(skill.slug))
  }, [activeWorkspaceId, navigate])

  // Focus zone management
  const { focusZone, focusNextZone, focusPreviousZone } = useFocusContext()

  // Register focus zones
  const { zoneRef: sidebarRef, isFocused: sidebarFocused } = useFocusZone({ zoneId: 'sidebar' })

  // Ref for focusing chat input (passed to ChatDisplay)
  const chatInputRef = useRef<RichTextInputHandle>(null)
  const focusChatInput = useCallback(() => {
    chatInputRef.current?.focus()
  }, [])

  // Global keyboard shortcuts
  useGlobalShortcuts({
    shortcuts: [
      // Zone navigation
      { key: '1', cmd: true, action: () => focusZone('sidebar') },
      { key: '2', cmd: true, action: () => focusZone('session-list') },
      { key: '3', cmd: true, action: () => focusZone('chat') },
      // Tab navigation between zones
      { key: 'Tab', action: focusNextZone, when: () => !document.querySelector('[role="dialog"]') },
      // Shift+Tab cycles permission mode through enabled modes (textarea handles its own, this handles when focus is elsewhere)
      {
        key: 'Tab', shift: true, action: () => {
          if (session.selected) {
            const currentOptions = contextValue.sessionOptions.get(session.selected)
            const currentMode = currentOptions?.permissionMode ?? 'ask'
            // Cycle through enabled permission modes
            const modes = enabledModes.length >= 2 ? enabledModes : ['safe', 'ask', 'allow-all'] as PermissionMode[]
            const currentIndex = modes.indexOf(currentMode)
            // If current mode not in enabled list, jump to first enabled mode
            const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % modes.length
            const nextMode = modes[nextIndex]
            contextValue.onSessionOptionsChange(session.selected, { permissionMode: nextMode })
          }
        }, when: () => !document.querySelector('[role="dialog"]') && document.activeElement?.tagName !== 'TEXTAREA'
      },
      // Sidebar toggle (CMD+\ like VS Code, avoids conflict with CMD+B for bold)
      { key: '\\', cmd: true, action: () => setIsSidebarVisible(v => !v) },
      // New chat
      { key: 'n', cmd: true, action: () => handleNewChat(true) },
      // Settings
      { key: ',', cmd: true, action: onOpenSettings },
      // History navigation
      { key: '[', cmd: true, action: goBack },
      { key: ']', cmd: true, action: goForward },
      // ESC to stop processing - requires double-press within 1 second
      // First press shows warning overlay, second press interrupts
      {
        key: 'Escape', action: () => {
          if (session.selected) {
            const meta = sessionMetaMap.get(session.selected)
            if (meta?.isProcessing) {
              // handleEscapePress returns true on second press (within timeout)
              const shouldInterrupt = handleEscapePress()
              if (shouldInterrupt) {
                window.electronAPI.cancelProcessing(session.selected, false).catch(err => {
                  console.error('[AppShell] Failed to cancel processing:', err)
                })
              }
            }
          }
        }, when: () => {
          // Only active when no overlay is open and session is processing
          // Overlays (dialogs, menus, popovers, etc.) should handle their own Escape
          if (hasOpenOverlay()) return false
          if (!session.selected) return false
          const meta = sessionMetaMap.get(session.selected)
          return meta?.isProcessing ?? false
        }
      },
    ],
  })

  // Global paste listener for file attachments
  // Fires when Cmd+V is pressed anywhere in the app (not just textarea)
  React.useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Skip if a dialog or menu is open
      if (document.querySelector('[role="dialog"], [role="menu"]')) {
        return
      }

      // Skip if there are no files in the clipboard
      const files = e.clipboardData?.files
      if (!files || files.length === 0) return

      // Skip if the active element is an input/textarea/contenteditable (let it handle paste directly)
      const activeElement = document.activeElement as HTMLElement | null
      if (
        activeElement?.tagName === 'TEXTAREA' ||
        activeElement?.tagName === 'INPUT' ||
        activeElement?.isContentEditable
      ) {
        return
      }

      // Prevent default paste behavior
      e.preventDefault()

      // Dispatch custom event for FreeFormInput to handle
      const filesArray = Array.from(files)
      window.dispatchEvent(new CustomEvent('craft:paste-files', {
        detail: { files: filesArray }
      }))
    }

    document.addEventListener('paste', handleGlobalPaste)
    return () => document.removeEventListener('paste', handleGlobalPaste)
  }, [])

  // Resize effect for sidebar, session list, and right sidebar
  React.useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      if (isResizing === 'sidebar') {
        const newWidth = Math.min(Math.max(e.clientX, 180), 320)
        setSidebarWidth(newWidth)
        if (resizeHandleRef.current) {
          const rect = resizeHandleRef.current.getBoundingClientRect()
          setSidebarHandleY(e.clientY - rect.top)
        }
      } else if (isResizing === 'session-list') {
        const offset = isSidebarVisible ? sidebarWidth : 0
        const newWidth = Math.min(Math.max(e.clientX - offset, 240), 480)
        setSessionListWidth(newWidth)
        if (sessionListHandleRef.current) {
          const rect = sessionListHandleRef.current.getBoundingClientRect()
          setSessionListHandleY(e.clientY - rect.top)
        }
      } else if (isResizing === 'right-sidebar') {
        // Calculate from right edge
        const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, 280), 480)
        setRightSidebarWidth(newWidth)
        if (rightSidebarHandleRef.current) {
          const rect = rightSidebarHandleRef.current.getBoundingClientRect()
          setRightSidebarHandleY(e.clientY - rect.top)
        }
      }
    }

    const handleMouseUp = () => {
      if (isResizing === 'sidebar') {
        storage.set(storage.KEYS.sidebarWidth, sidebarWidth)
        setSidebarHandleY(null)
      } else if (isResizing === 'session-list') {
        storage.set(storage.KEYS.sessionListWidth, sessionListWidth)
        setSessionListHandleY(null)
      } else if (isResizing === 'right-sidebar') {
        storage.set(storage.KEYS.rightSidebarWidth, rightSidebarWidth)
        setRightSidebarHandleY(null)
      }
      setIsResizing(null)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing, sidebarWidth, sessionListWidth, rightSidebarWidth, isSidebarVisible])

  // Spring transition config - shared between sidebar and header
  // Critical damping (no bounce): damping = 2 * sqrt(stiffness * mass)
  const springTransition = {
    type: "spring" as const,
    stiffness: 600,
    damping: 49,
  }

  // Use session metadata from Jotai atom (lightweight, no messages)
  // This prevents closures from retaining full message arrays
  const sessionMetaMap = useAtomValue(sessionMetaMapAtom)

  // Filter session metadata by active workspace
  const workspaceSessionMetas = useMemo(() => {
    const metas = Array.from(sessionMetaMap.values())
    return activeWorkspaceId
      ? metas.filter(s => s.workspaceId === activeWorkspaceId)
      : metas
  }, [sessionMetaMap, activeWorkspaceId])

  // Separate sessions by runtime to keep Agent and Chat modes isolated.
  const agentSessionMetas = useMemo(() => {
    return workspaceSessionMetas.filter(s => (s.runtime ?? 'claude') === 'claude')
  }, [workspaceSessionMetas])

  const chatSessionMetas = useMemo(() => {
    const filtered = workspaceSessionMetas.filter(s => s.runtime === 'openrouter-chat')
    console.log('[Chat] Total workspace sessions:', workspaceSessionMetas.length)
    console.log('[Chat] Filtered chat sessions:', filtered.length, filtered.map(s => ({ id: s.id, runtime: s.runtime, name: s.name })))
    return filtered
  }, [workspaceSessionMetas])

  // Count sessions by todo state (scoped to workspace and mode)
  const isMetaDone = (s: SessionMeta) => s.todoState === 'done' || s.todoState === 'cancelled'

  // Use appropriate session list based on app mode
  const currentModeSessions = appMode === 'chat' ? chatSessionMetas : agentSessionMetas
  const flaggedCount = currentModeSessions.filter(s => s.isFlagged).length

  // Count sessions by individual todo state (dynamic based on todoStates)
  const todoStateCounts = useMemo(() => {
    const counts: Record<TodoStateId, number> = {}
    // Initialize counts for all dynamic statuses
    for (const state of todoStates) {
      counts[state.id] = 0
    }
    // Count sessions
    for (const s of currentModeSessions) {
      const state = (s.todoState || 'todo') as TodoStateId
      // Increment count (initialize to 0 if status not in todoStates yet)
      counts[state] = (counts[state] || 0) + 1
    }
    return counts
  }, [currentModeSessions, todoStates])

  // Count sources by type for the Sources dropdown subcategories
  const sourceTypeCounts = useMemo(() => {
    const counts = { api: 0, mcp: 0, local: 0 }
    for (const source of sources) {
      const t = source.config.type
      if (t === 'api' || t === 'mcp' || t === 'local') {
        counts[t]++
      }
    }
    return counts
  }, [sources])

  // Filter session metadata based on sidebar mode and chat filter
  const filteredSessionMetas = useMemo(() => {
    // When in sources mode, return empty (no sessions to show)
    if (!chatFilter) {
      return []
    }

    let result: SessionMeta[]

    switch (chatFilter.kind) {
      case 'allChats':
        // "All Chats" - shows all sessions for current mode
        result = currentModeSessions
        break
      case 'flagged':
        result = currentModeSessions.filter(s => s.isFlagged)
        break
      case 'state':
        // Filter by specific todo state
        result = currentModeSessions.filter(s => (s.todoState || 'todo') === chatFilter.stateId)
        break
      default:
        result = currentModeSessions
    }

    // Apply secondary filter by todo states if any are selected (only in allChats view)
    if (chatFilter.kind === 'allChats' && listFilter.size > 0) {
      result = result.filter(s => listFilter.has((s.todoState || 'todo') as TodoStateId))
    }

    return result
  }, [currentModeSessions, chatFilter, listFilter])

  // Ensure session messages are loaded when selected
  React.useEffect(() => {
    if (session.selected) {
      ensureMessagesLoaded(session.selected)
    }
  }, [session.selected, ensureMessagesLoaded])

  // Wrap delete handler to clear selection when deleting the currently selected session
  // This prevents stale state during re-renders that could cause crashes
  const handleDeleteSession = useCallback(async (sessionId: string, skipConfirmation?: boolean): Promise<boolean> => {
    // Clear selection first if this is the selected session
    if (session.selected === sessionId) {
      setSession({ selected: null })
    }
    return onDeleteSession(sessionId, skipConfirmation)
  }, [session.selected, setSession, onDeleteSession])

  // Right sidebar OPEN button (fades out when sidebar is open, hidden in focused mode or non-chat views)
  const rightSidebarOpenButton = React.useMemo(() => {
    if (isFocusedMode || !isChatsNavigation(navState) || !navState.details) return null

    return (
      <motion.div
        initial={false}
        animate={{ opacity: isRightSidebarVisible ? 0 : 1 }}
        transition={{ duration: 0.15 }}
        style={{ pointerEvents: isRightSidebarVisible ? 'none' : 'auto' }}
      >
        <HeaderIconButton
          icon={<PanelRightRounded className="h-5 w-6" />}
          onClick={() => setIsRightSidebarVisible(true)}
          tooltip="Open sidebar"
          className="text-foreground"
        />
      </motion.div>
    )
  }, [isFocusedMode, navState, isRightSidebarVisible])

  // Right sidebar CLOSE button (shown in sidebar header when open)
  const rightSidebarCloseButton = React.useMemo(() => {
    if (isFocusedMode || !isRightSidebarVisible) return null

    return (
      <HeaderIconButton
        icon={<PanelLeftRounded className="h-5 w-6" />}
        onClick={() => setIsRightSidebarVisible(false)}
        tooltip="Close sidebar"
        className="text-foreground"
      />
    )
  }, [isFocusedMode, isRightSidebarVisible])

  // Extend context value with local overrides (textareaRef, wrapped onDeleteSession, sources, skills, enabledModes, rightSidebarOpenButton, todoStates)
  const appShellContextValue = React.useMemo<AppShellContextType>(() => ({
    ...contextValue,
    onDeleteSession: handleDeleteSession,
    textareaRef: chatInputRef,
    enabledSources: sources,
    skills,
    enabledModes,
    todoStates,
    onSessionSourcesChange: handleSessionSourcesChange,
    rightSidebarButton: rightSidebarOpenButton,
  }), [contextValue, handleDeleteSession, sources, skills, enabledModes, todoStates, handleSessionSourcesChange, rightSidebarOpenButton])

  // Persist expanded folders to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.expandedFolders, [...expandedFolders])
  }, [expandedFolders])

  // Persist sidebar visibility to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.sidebarVisible, isSidebarVisible)
  }, [isSidebarVisible])

  // Persist right sidebar visibility to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.rightSidebarVisible, isRightSidebarVisible)
  }, [isRightSidebarVisible])

  // Persist list filter to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.listFilter, [...listFilter])
  }, [listFilter])

  // Persist sidebar section collapsed states
  React.useEffect(() => {
    storage.set(storage.KEYS.collapsedSidebarItems, [...collapsedItems])
  }, [collapsedItems])

  // Persist app mode to localStorage
  React.useEffect(() => {
    storage.set(storage.KEYS.appMode, appMode)
  }, [appMode])

  // Handle mode change - navigate to appropriate view
  const handleModeChange = useCallback((mode: AppMode) => {
    setAppMode(mode)
    if (mode === 'chat') {
      // Navigate to chat navigator (OpenRouter chat mode)
      const lastChatSessionId = storage.get<string | null>(storage.KEYS.lastChatSessionId, null)
      navigate(lastChatSessionId ? routes.view.chat(lastChatSessionId) : routes.view.chat())
    } else {
      // Navigate to agent mode (chats navigator)
      const lastAgentSessionId = storage.get<string | null>(storage.KEYS.lastAgentSessionId, null)
      navigate(lastAgentSessionId ? routes.view.allChats(lastAgentSessionId) : routes.view.allChats())
    }
  }, [navigate])

  const handleAllChatsClick = useCallback(() => {
    // Navigate to appropriate route based on mode
    if (appMode === 'chat') {
      navigate(routes.view.chat())
    } else {
      navigate(routes.view.allChats())
    }
  }, [appMode, navigate])

  const handleFlaggedClick = useCallback(() => {
    // Navigate to appropriate route based on mode
    if (appMode === 'chat') {
      navigate(routes.view.chat())
    } else {
      navigate(routes.view.flagged())
    }
  }, [appMode, navigate])

  // Handler for individual todo state views
  const handleTodoStateClick = useCallback((stateId: TodoStateId) => {
    // Navigate to appropriate route based on mode
    if (appMode === 'chat') {
      navigate(routes.view.chat())
    } else {
      navigate(routes.view.state(stateId))
    }
  }, [appMode, navigate])

  // Handler for sources view (all sources)
  const handleSourcesClick = useCallback(() => {
    navigate(routes.view.sources())
  }, [])

  // Handlers for source type filter views (subcategories in Sources dropdown)
  const handleSourcesApiClick = useCallback(() => {
    navigate(routes.view.sourcesApi())
  }, [])

  const handleSourcesMcpClick = useCallback(() => {
    navigate(routes.view.sourcesMcp())
  }, [])

  const handleSourcesLocalClick = useCallback(() => {
    navigate(routes.view.sourcesLocal())
  }, [])

  // Handler for skills view
  const handleSkillsClick = useCallback(() => {
    navigate(routes.view.skills())
  }, [])

  // Handler for settings view
  const handleSettingsClick = useCallback((subpage: SettingsSubpage = 'app') => {
    navigate(routes.view.settings(subpage))
  }, [])

  // ============================================================================
  // EDIT POPOVER STATE
  // ============================================================================
  // State to control which EditPopover is open (triggered from context menus).
  // We use controlled popovers instead of deep links so the user can type
  // their request in the popover UI before opening a new chat window.
  // add-source variants: add-source (generic), add-source-api, add-source-mcp, add-source-local
  const [editPopoverOpen, setEditPopoverOpen] = useState<'statuses' | 'add-source' | 'add-source-api' | 'add-source-mcp' | 'add-source-local' | 'add-skill' | null>(null)

  // Handler for "Configure Statuses" context menu action
  // Opens the EditPopover for status configuration
  // Uses setTimeout to delay opening until after context menu closes,
  // preventing the popover from immediately closing due to focus shift
  const openConfigureStatuses = useCallback(() => {
    setTimeout(() => setEditPopoverOpen('statuses'), 50)
  }, [])

  // Handler for "Add Source" context menu action
  // Opens the EditPopover for adding a new source
  // Optional sourceType param allows filter-aware context (from subcategory menus or filtered views)
  const openAddSource = useCallback((sourceType?: 'api' | 'mcp' | 'local') => {
    const key = sourceType ? `add-source-${sourceType}` as const : 'add-source' as const
    setTimeout(() => setEditPopoverOpen(key), 50)
  }, [])

  // Handler for "Add Skill" context menu action
  // Opens the EditPopover for adding a new skill
  const openAddSkill = useCallback(() => {
    setTimeout(() => setEditPopoverOpen('add-skill'), 50)
  }, [])

  // Create a new chat and select it
  const createAndNavigateChatSession = useCallback(async () => {
    if (!activeWorkspace) {
      console.log('[Chat] No active workspace')
      return
    }
    console.log('[Chat] Creating new chat session for workspace:', activeWorkspace.id)
    const model = storage.get<string>(storage.KEYS.openrouterLastModel, 'openai/gpt-4o-mini')
    console.log('[Chat] Using model:', model)
    const newSession = await window.electronAPI.createSession(activeWorkspace.id, {
      runtime: 'openrouter-chat',
      model,
    })
    console.log('[Chat] Created session:', newSession.id, 'Runtime:', newSession.runtime)
    storage.set(storage.KEYS.lastChatSessionId, newSession.id)
    navigate(routes.view.chat(newSession.id))
  }, [activeWorkspace, navigate])

  const createAndNavigateAgentSession = useCallback(async () => {
    if (!activeWorkspace) return
    const newSession = await onCreateSession(activeWorkspace.id)
    storage.set(storage.KEYS.lastAgentSessionId, newSession.id)
    navigate(routes.view.allChats(newSession.id))
  }, [activeWorkspace, onCreateSession, navigate])

  // Create a new chat and select it (respects current mode)
  const handleNewChat = useCallback(async (_useCurrentAgent: boolean = true) => {
    if (appMode === 'chat') {
      await createAndNavigateChatSession()
      return
    }
    await createAndNavigateAgentSession()
  }, [appMode, createAndNavigateChatSession, createAndNavigateAgentSession])

  // Delete Source - simplified since agents system is removed
  const handleDeleteSource = useCallback(async (sourceSlug: string) => {
    if (!activeWorkspace) return
    try {
      await window.electronAPI.deleteSource(activeWorkspace.id, sourceSlug)
      toast.success(`Deleted source`)
    } catch (error) {
      console.error('[Chat] Failed to delete source:', error)
      toast.error('Failed to delete source')
    }
  }, [activeWorkspace])

  // Delete Skill
  const handleDeleteSkill = useCallback(async (skillSlug: string) => {
    if (!activeWorkspace) return
    try {
      await window.electronAPI.deleteSkill(activeWorkspace.id, skillSlug)
      toast.success(`Deleted skill: ${skillSlug}`)
    } catch (error) {
      console.error('[Chat] Failed to delete skill:', error)
      toast.error('Failed to delete skill')
    }
  }, [activeWorkspace])

  // Respond to menu bar "New Chat" trigger
  const menuTriggerRef = useRef(menuNewChatTrigger)
  useEffect(() => {
    // Skip initial render
    if (menuTriggerRef.current === menuNewChatTrigger) return
    menuTriggerRef.current = menuNewChatTrigger
    handleNewChat(true)
  }, [menuNewChatTrigger, handleNewChat])

  // Unified sidebar items: nav buttons only (agents system removed)
  type SidebarItem = {
    id: string
    type: 'nav'
    action?: () => void
  }

  const unifiedSidebarItems = React.useMemo((): SidebarItem[] => {
    const result: SidebarItem[] = []

    if (appMode === 'chat') {
      result.push({ id: 'nav:chat', type: 'nav', action: () => navigate(routes.view.chat()) })
    } else {
      // Agent mode nav items (All Chats, Flagged, Statuses)
      result.push({ id: 'nav:allChats', type: 'nav', action: handleAllChatsClick })
      result.push({ id: 'nav:flagged', type: 'nav', action: handleFlaggedClick })
      for (const state of todoStates) {
        result.push({ id: `nav:state:${state.id}`, type: 'nav', action: () => handleTodoStateClick(state.id) })
      }
    }

    // Sources nav item
    result.push({ id: 'nav:sources', type: 'nav', action: handleSourcesClick })

    // 2.6. Skills nav item
    result.push({ id: 'nav:skills', type: 'nav', action: handleSkillsClick })

    // 2.7. Settings nav item
    result.push({ id: 'nav:settings', type: 'nav', action: () => handleSettingsClick('app') })

    return result
  }, [appMode, handleAllChatsClick, handleFlaggedClick, handleTodoStateClick, todoStates, handleSourcesClick, handleSkillsClick, handleSettingsClick])


  // Get props for any sidebar item (unified roving tabindex pattern)
  const getSidebarItemProps = React.useCallback((id: string) => ({
    tabIndex: focusedSidebarItemId === id ? 0 : -1,
    'data-focused': focusedSidebarItemId === id,
    ref: (el: HTMLElement | null) => {
      if (el) {
        sidebarItemRefs.current.set(id, el)
      } else {
        sidebarItemRefs.current.delete(id)
      }
    },
  }), [focusedSidebarItemId])

  // Unified sidebar keyboard navigation
  const handleSidebarKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    if (!sidebarFocused || unifiedSidebarItems.length === 0) return

    const currentIndex = unifiedSidebarItems.findIndex(item => item.id === focusedSidebarItemId)
    const currentItem = currentIndex >= 0 ? unifiedSidebarItems[currentIndex] : null

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const nextIndex = currentIndex < unifiedSidebarItems.length - 1 ? currentIndex + 1 : 0
        const nextItem = unifiedSidebarItems[nextIndex]
        setFocusedSidebarItemId(nextItem.id)
        sidebarItemRefs.current.get(nextItem.id)?.focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prevIndex = currentIndex > 0 ? currentIndex - 1 : unifiedSidebarItems.length - 1
        const prevItem = unifiedSidebarItems[prevIndex]
        setFocusedSidebarItemId(prevItem.id)
        sidebarItemRefs.current.get(prevItem.id)?.focus()
        break
      }
      case 'ArrowLeft': {
        e.preventDefault()
        // At boundary - do nothing (Left doesn't change zones from sidebar)
        break
      }
      case 'ArrowRight': {
        e.preventDefault()
        // Move to next zone (session list)
        focusZone('session-list')
        break
      }
      case 'Enter':
      case ' ': {
        e.preventDefault()
        if (currentItem?.type === 'nav' && currentItem.action) {
          currentItem.action()
        }
        break
      }
      case 'Home': {
        e.preventDefault()
        if (unifiedSidebarItems.length > 0) {
          const firstItem = unifiedSidebarItems[0]
          setFocusedSidebarItemId(firstItem.id)
          sidebarItemRefs.current.get(firstItem.id)?.focus()
        }
        break
      }
      case 'End': {
        e.preventDefault()
        if (unifiedSidebarItems.length > 0) {
          const lastItem = unifiedSidebarItems[unifiedSidebarItems.length - 1]
          setFocusedSidebarItemId(lastItem.id)
          sidebarItemRefs.current.get(lastItem.id)?.focus()
        }
        break
      }
    }
  }, [sidebarFocused, unifiedSidebarItems, focusedSidebarItemId, focusZone])

  // Focus sidebar item when sidebar zone gains focus
  React.useEffect(() => {
    if (sidebarFocused && unifiedSidebarItems.length > 0) {
      // Set focused item if not already set
      const itemId = focusedSidebarItemId || unifiedSidebarItems[0].id
      if (!focusedSidebarItemId) {
        setFocusedSidebarItemId(itemId)
      }
      // Actually focus the DOM element
      requestAnimationFrame(() => {
        sidebarItemRefs.current.get(itemId)?.focus()
      })
    }
  }, [sidebarFocused, focusedSidebarItemId, unifiedSidebarItems])

  // Get title based on navigation state
  const listTitle = React.useMemo(() => {
    // Sources navigator
    if (isSourcesNavigation(navState)) {
      return 'Sources'
    }

    // Skills navigator
    if (isSkillsNavigation(navState)) {
      return 'All Skills'
    }

    // Settings navigator
    if (isSettingsNavigation(navState)) return 'Settings'

    // Chat navigator (OpenRouter mode)
    // Chat navigator (OpenRouter mode)
    if (isChatNavigation(navState)) return 'Chats'

    // Chats navigator - use chatFilter
    if (!chatFilter) return 'All Chats'

    switch (chatFilter.kind) {
      case 'flagged':
        return 'Flagged'
      case 'state':
        const state = todoStates.find(s => s.id === chatFilter.stateId)
        return state?.label || 'All Chats'
      default:
        return 'All Chats'
    }
  }, [navState, chatFilter, todoStates])

  return (
    <AppShellProvider value={appShellContextValue}>
      <TooltipProvider delayDuration={0}>
        {/*
          Draggable title bar region for transparent window (macOS)
          - Fixed overlay at z-titlebar allows window dragging from the top bar area
          - Interactive elements (buttons, dropdowns) must use:
            1. titlebar-no-drag: prevents drag behavior on clickable elements
            2. relative z-panel: ensures elements render above this drag overlay
        */}
        <div className="titlebar-drag-region fixed top-0 left-0 right-0 h-[50px] z-titlebar" />

        {/* App Menu - fixed position, always visible (hidden in focused mode) */}
        {!isFocusedMode && (
          <div
            className="fixed left-[86px] top-0 h-[50px] z-overlay flex items-center titlebar-no-drag pr-2"
            style={{ width: sidebarWidth - 86 }}
          >
            <AppMenu
              onNewChat={() => handleNewChat(true)}
              onOpenSettings={onOpenSettings}
              onOpenKeyboardShortcuts={onOpenKeyboardShortcuts}
              onOpenStoredUserPreferences={onOpenStoredUserPreferences}
              onReset={onReset}
              onBack={goBack}
              onForward={goForward}
              canGoBack={canGoBack}
              canGoForward={canGoForward}
              onToggleSidebar={() => setIsSidebarVisible(prev => !prev)}
              isSidebarVisible={isSidebarVisible}
            />
          </div>
        )}

        {/* === OUTER LAYOUT: Sidebar | Main Content === */}
        <div className="h-full flex items-stretch relative">
          {/* === SIDEBAR (Left) === (hidden in focused mode)
            Animated width with spring physics for smooth 60-120fps transitions.
            Uses overflow-hidden to clip content during collapse animation.
            Resizable via drag handle on right edge (200-400px range). */}
          {!isFocusedMode && (
            <motion.div
              initial={false}
              animate={{ width: isSidebarVisible ? sidebarWidth : 0 }}
              transition={isResizing ? { duration: 0 } : springTransition}
              className="h-full overflow-hidden shrink-0 relative"
            >
              <div
                ref={sidebarRef}
                style={{ width: sidebarWidth }}
                className="h-full font-sans relative"
                data-focus-zone="sidebar"
                tabIndex={sidebarFocused ? 0 : -1}
                onKeyDown={handleSidebarKeyDown}
              >
                <div className="flex h-full flex-col pt-[50px] select-none">
                  {/* Sidebar Top Section */}
                  <div className="flex-1 flex flex-col min-h-0">
                    {/* Mode Toggle - Agent vs Chat */}
                    <div className="px-2 pt-1 pb-1 relative z-panel titlebar-no-drag">
                      <ModeToggle
                        value={appMode}
                        onChange={handleModeChange}
                        className="w-full"
                      />
                    </div>
                    {/* New Chat Button - Gmail-style, with context menu for "Open in New Window" */}
                    <div className="px-2 pt-1 pb-2">
                      <ContextMenu modal={true}>
                        <ContextMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            onClick={() => handleNewChat(true)}
                            className="w-full justify-start gap-2 py-[7px] px-2 text-[13px] font-normal rounded-[6px] shadow-minimal bg-background"
                            data-tutorial="new-chat-button"
                          >
                            <SquarePenRounded className="h-3.5 w-3.5 shrink-0" />
                            New Chat
                          </Button>
                        </ContextMenuTrigger>
                        <StyledContextMenuContent>
                          <ContextMenuProvider>
                            <SidebarMenu type="newChat" />
                          </ContextMenuProvider>
                        </StyledContextMenuContent>
                      </ContextMenu>
                    </div>
                    {/* Primary Nav: All Chats (with expandable submenu), Sources */}
                    <LeftSidebar
                      isCollapsed={false}
                      getItemProps={getSidebarItemProps}
                      focusedItemId={focusedSidebarItemId}
                      links={appMode === 'chat' ? [
                        {
                          id: "nav:allChats",
                          title: "All Chats",
                          label: String(chatSessionMetas.length),
                          icon: Inbox,
                          variant: chatFilter?.kind === 'allChats' ? "default" : "ghost",
                          onClick: handleAllChatsClick,
                          expandable: true,
                          expanded: isExpanded('nav:allChats'),
                          onToggle: () => toggleExpanded('nav:allChats'),
                          contextMenu: {
                            type: 'allChats',
                            onConfigureStatuses: openConfigureStatuses,
                          },
                          items: [
                            ...todoStates.map(state => ({
                              id: `nav:state:${state.id}`,
                              title: state.label,
                              label: String(todoStateCounts[state.id] || 0),
                              icon: state.icon,
                              iconColor: state.color,
                              iconColorable: state.iconColorable,
                              variant: (chatFilter?.kind === 'state' && chatFilter.stateId === state.id ? "default" : "ghost") as "default" | "ghost",
                              onClick: () => handleTodoStateClick(state.id),
                              contextMenu: {
                                type: 'status' as const,
                                statusId: state.id,
                                onConfigureStatuses: openConfigureStatuses,
                              },
                            })),
                            { id: "separator:before-flagged", type: "separator" },
                            {
                              id: "nav:flagged",
                              title: "Flagged",
                              label: String(flaggedCount),
                              icon: <Flag className="h-3.5 w-3.5 fill-current" />,
                              iconColor: "text-info",
                              variant: chatFilter?.kind === 'flagged' ? "default" : "ghost",
                              onClick: handleFlaggedClick,
                              contextMenu: {
                                type: 'flagged' as const,
                                onConfigureStatuses: openConfigureStatuses,
                              },
                            },
                          ],
                        },
                        {
                          id: "nav:sources",
                          title: "Sources",
                          label: String(sources.length),
                          icon: DatabaseZap,
                          variant: (isSourcesNavigation(navState) && !sourceFilter) ? "default" : "ghost",
                          onClick: handleSourcesClick,
                          dataTutorial: "sources-nav",
                          expandable: true,
                          expanded: isExpanded('nav:sources'),
                          onToggle: () => toggleExpanded('nav:sources'),
                          contextMenu: {
                            type: 'sources',
                            onAddSource: openAddSource,
                          },
                          items: [
                            {
                              id: "nav:sources:api",
                              title: "APIs",
                              label: String(sourceTypeCounts.api),
                              icon: Globe,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'api') ? "default" : "ghost",
                              onClick: handleSourcesApiClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('api'),
                                sourceType: 'api',
                              },
                            },
                            {
                              id: "nav:sources:mcp",
                              title: "MCPs",
                              label: String(sourceTypeCounts.mcp),
                              icon: <McpIcon className="h-3.5 w-3.5" />,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'mcp') ? "default" : "ghost",
                              onClick: handleSourcesMcpClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('mcp'),
                                sourceType: 'mcp',
                              },
                            },
                            {
                              id: "nav:sources:local",
                              title: "Local Folders",
                              label: String(sourceTypeCounts.local),
                              icon: FolderOpen,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'local') ? "default" : "ghost",
                              onClick: handleSourcesLocalClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('local'),
                                sourceType: 'local',
                              },
                            },
                          ],
                        },
                        {
                          id: "nav:skills",
                          title: "Skills",
                          label: String(skills.length),
                          icon: Zap,
                          variant: isSkillsNavigation(navState) ? "default" : "ghost",
                          onClick: handleSkillsClick,
                          contextMenu: {
                            type: 'skills',
                            onAddSkill: openAddSkill,
                          },
                        },
                        { id: "separator:skills-settings", type: "separator" },
                        {
                          id: "nav:settings",
                          title: "Settings",
                          icon: Settings,
                          variant: isSettingsNavigation(navState) ? "default" : "ghost",
                          onClick: () => handleSettingsClick('app'),
                        },
                      ] : [
                        {
                          id: "nav:allChats",
                          title: "All Chats",
                          label: String(agentSessionMetas.length),
                          icon: Inbox,
                          variant: chatFilter?.kind === 'allChats' ? "default" : "ghost",
                          onClick: handleAllChatsClick,
                          expandable: true,
                          expanded: isExpanded('nav:allChats'),
                          onToggle: () => toggleExpanded('nav:allChats'),
                          contextMenu: {
                            type: 'allChats',
                            onConfigureStatuses: openConfigureStatuses,
                          },
                          items: [
                            ...todoStates.map(state => ({
                              id: `nav:state:${state.id}`,
                              title: state.label,
                              label: String(todoStateCounts[state.id] || 0),
                              icon: state.icon,
                              iconColor: state.color,
                              iconColorable: state.iconColorable,
                              variant: (chatFilter?.kind === 'state' && chatFilter.stateId === state.id ? "default" : "ghost") as "default" | "ghost",
                              onClick: () => handleTodoStateClick(state.id),
                              contextMenu: {
                                type: 'status' as const,
                                statusId: state.id,
                                onConfigureStatuses: openConfigureStatuses,
                              },
                            })),
                            { id: "separator:before-flagged", type: "separator" },
                            {
                              id: "nav:flagged",
                              title: "Flagged",
                              label: String(flaggedCount),
                              icon: <Flag className="h-3.5 w-3.5 fill-current" />,
                              iconColor: "text-info",
                              variant: chatFilter?.kind === 'flagged' ? "default" : "ghost",
                              onClick: handleFlaggedClick,
                              contextMenu: {
                                type: 'flagged' as const,
                                onConfigureStatuses: openConfigureStatuses,
                              },
                            },
                          ],
                        },
                        {
                          id: "nav:sources",
                          title: "Sources",
                          label: String(sources.length),
                          icon: DatabaseZap,
                          variant: (isSourcesNavigation(navState) && !sourceFilter) ? "default" : "ghost",
                          onClick: handleSourcesClick,
                          dataTutorial: "sources-nav",
                          expandable: true,
                          expanded: isExpanded('nav:sources'),
                          onToggle: () => toggleExpanded('nav:sources'),
                          contextMenu: {
                            type: 'sources',
                            onAddSource: openAddSource,
                          },
                          items: [
                            {
                              id: "nav:sources:api",
                              title: "APIs",
                              label: String(sourceTypeCounts.api),
                              icon: Globe,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'api') ? "default" : "ghost",
                              onClick: handleSourcesApiClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('api'),
                                sourceType: 'api',
                              },
                            },
                            {
                              id: "nav:sources:mcp",
                              title: "MCPs",
                              label: String(sourceTypeCounts.mcp),
                              icon: <McpIcon className="h-3.5 w-3.5" />,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'mcp') ? "default" : "ghost",
                              onClick: handleSourcesMcpClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('mcp'),
                                sourceType: 'mcp',
                              },
                            },
                            {
                              id: "nav:sources:local",
                              title: "Local Folders",
                              label: String(sourceTypeCounts.local),
                              icon: FolderOpen,
                              variant: (sourceFilter?.kind === 'type' && sourceFilter.sourceType === 'local') ? "default" : "ghost",
                              onClick: handleSourcesLocalClick,
                              contextMenu: {
                                type: 'sources' as const,
                                onAddSource: () => openAddSource('local'),
                                sourceType: 'local',
                              },
                            },
                          ],
                        },
                        {
                          id: "nav:skills",
                          title: "Skills",
                          label: String(skills.length),
                          icon: Zap,
                          variant: isSkillsNavigation(navState) ? "default" : "ghost",
                          onClick: handleSkillsClick,
                          contextMenu: {
                            type: 'skills',
                            onAddSkill: openAddSkill,
                          },
                        },
                        { id: "separator:skills-settings", type: "separator" },
                        {
                          id: "nav:settings",
                          title: "Settings",
                          icon: Settings,
                          variant: isSettingsNavigation(navState) ? "default" : "ghost",
                          onClick: () => handleSettingsClick('app'),
                        },
                      ]}
                    />
                    {/* Agent Tree: Hierarchical list of agents */}
                    {/* Agents section removed */}
                  </div>

                  {/* Sidebar Bottom Section: WorkspaceSwitcher + Help icon */}
                  <div className="mt-auto shrink-0 py-2 px-2">
                    <div className="flex items-center gap-1">
                      {/* Workspace switcher takes available space */}
                      <div className="flex-1 min-w-0">
                        <WorkspaceSwitcher
                          isCollapsed={false}
                          workspaces={workspaces}
                          activeWorkspaceId={activeWorkspaceId}
                          onSelect={onSelectWorkspace}
                          onWorkspaceCreated={() => onRefreshWorkspaces?.()}
                        />
                      </div>
                      {/* Help button - icon only with tooltip */}
                      <DropdownMenu>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <DropdownMenuTrigger asChild>
                                <button
                                  className="flex items-center justify-center h-7 w-7 rounded-[6px] select-none outline-none hover:bg-foreground/5 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
                                >
                                  <HelpCircle className="h-4 w-4 text-foreground/60" />
                                </button>
                              </DropdownMenuTrigger>
                            </TooltipTrigger>
                            <TooltipContent side="top">Help & Documentation</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <StyledDropdownMenuContent align="end" side="top" sideOffset={8}>
                          <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl(getDocUrl('sources'))}>
                            <DatabaseZap className="h-3.5 w-3.5" />
                            <span className="flex-1">Sources</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </StyledDropdownMenuItem>
                          <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl(getDocUrl('skills'))}>
                            <Zap className="h-3.5 w-3.5" />
                            <span className="flex-1">Skills</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </StyledDropdownMenuItem>
                          <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl(getDocUrl('statuses'))}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span className="flex-1">Statuses</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </StyledDropdownMenuItem>
                          <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl(getDocUrl('permissions'))}>
                            <Settings className="h-3.5 w-3.5" />
                            <span className="flex-1">Permissions</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground" />
                          </StyledDropdownMenuItem>
                          <StyledDropdownMenuSeparator />
                          <StyledDropdownMenuItem onClick={() => window.electronAPI.openUrl('https://agents.craft.do/docs')}>
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="flex-1">All Documentation</span>
                          </StyledDropdownMenuItem>
                        </StyledDropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Sidebar Resize Handle (hidden in focused mode) */}
          {!isFocusedMode && (
            <div
              ref={resizeHandleRef}
              onMouseDown={(e) => { e.preventDefault(); setIsResizing('sidebar') }}
              onMouseMove={(e) => {
                if (resizeHandleRef.current) {
                  const rect = resizeHandleRef.current.getBoundingClientRect()
                  setSidebarHandleY(e.clientY - rect.top)
                }
              }}
              onMouseLeave={() => { if (!isResizing) setSidebarHandleY(null) }}
              className="absolute top-0 w-3 h-full cursor-col-resize z-panel flex justify-center"
              style={{
                left: isSidebarVisible ? sidebarWidth - 6 : -6,
                transition: isResizing === 'sidebar' ? undefined : 'left 0.15s ease-out',
              }}
            >
              {/* Visual indicator - 2px wide */}
              <div
                className="w-0.5 h-full"
                style={getResizeGradientStyle(sidebarHandleY)}
              />
            </div>
          )}

          {/* === MAIN CONTENT (Right) ===
            Flex layout: Session List | Chat Display */}
          <div
            className="flex-1 overflow-hidden min-w-0 flex h-full"
            style={{ padding: PANEL_WINDOW_EDGE_SPACING, gap: PANEL_PANEL_SPACING / 2 }}
          >
            {/* === SESSION LIST PANEL === (hidden in focused mode) */}
            {!isFocusedMode && (
              <div
                className="h-full flex flex-col min-w-0 bg-background shrink-0 shadow-middle overflow-hidden rounded-l-[14px] rounded-r-[10px]"
                style={{ width: sessionListWidth }}
              >
                <PanelHeader
                  title={isSidebarVisible ? listTitle : undefined}
                  compensateForStoplight={!isSidebarVisible}
                  actions={
                    <>
                      {/* Filter dropdown - allows filtering by todo states (for All Chats view AND Chat Mode) */}
                      {(chatFilter?.kind === 'allChats' || isChatNavigation(navState)) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <HeaderIconButton
                              icon={<ListFilter className="h-4 w-4" />}
                              className={listFilter.size > 0 ? "text-foreground" : undefined}
                            />
                          </DropdownMenuTrigger>
                          <StyledDropdownMenuContent align="end" light minWidth="min-w-[200px]">
                            {/* Header with title and clear button */}
                            <div className="flex items-center justify-between px-2 py-1.5 border-b border-foreground/5">
                              <span className="text-xs font-medium text-muted-foreground">Filter Chats</span>
                              {listFilter.size > 0 && (
                                <button
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setListFilter(new Set())
                                  }}
                                  className="text-xs text-muted-foreground hover:text-foreground"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                            {/* Dynamic status filter items */}
                            {todoStates.map(state => {
                              // Only apply color if icon is colorable (uses currentColor)
                              const applyColor = state.iconColorable
                              return (
                                <StyledDropdownMenuItem
                                  key={state.id}
                                  onClick={(e) => {
                                    e.preventDefault()
                                    setListFilter(prev => {
                                      const next = new Set(prev)
                                      if (next.has(state.id)) next.delete(state.id)
                                      else next.add(state.id)
                                      return next
                                    })
                                  }}
                                >
                                  <span
                                    className={cn(
                                      "h-3.5 w-3.5 flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full [&>img]:w-full [&>img]:h-full",
                                      applyColor && !isHexColor(state.color) && state.color
                                    )}
                                    style={applyColor && isHexColor(state.color) ? { color: state.color } : undefined}
                                  >
                                    {state.icon}
                                  </span>
                                  <span className="flex-1">{state.label}</span>
                                  <span className="w-3.5 ml-4">{listFilter.has(state.id) && <Check className="h-3.5 w-3.5 text-foreground" />}</span>
                                </StyledDropdownMenuItem>
                              )
                            })}
                            <StyledDropdownMenuSeparator />
                            <StyledDropdownMenuItem
                              onClick={() => {
                                setSearchActive(true)
                              }}
                            >
                              <Search className="h-3.5 w-3.5" />
                              <span className="flex-1">Search</span>
                            </StyledDropdownMenuItem>
                            <StyledDropdownMenuSeparator />
                            <StyledDropdownMenuItem
                              onClick={() => {
                                window.electronAPI?.openUrl(getDocUrl('statuses'))
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="flex-1">Learn More</span>
                            </StyledDropdownMenuItem>
                          </StyledDropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {/* More menu with Search for non-allChats views (only for chats mode) */}
                      {isChatsNavigation(navState) && chatFilter?.kind !== 'allChats' && !isChatNavigation(navState) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <HeaderIconButton icon={<MoreHorizontal className="h-4 w-4" />} />
                          </DropdownMenuTrigger>
                          <StyledDropdownMenuContent align="end" light>
                            <StyledDropdownMenuItem
                              onClick={() => {
                                setSearchActive(true)
                              }}
                            >
                              <Search className="h-3.5 w-3.5" />
                              <span className="flex-1">Search</span>
                            </StyledDropdownMenuItem>
                            <StyledDropdownMenuSeparator />
                            <StyledDropdownMenuItem
                              onClick={() => {
                                window.electronAPI?.openUrl(getDocUrl('statuses'))
                              }}
                            >
                              <ExternalLink className="h-3.5 w-3.5" />
                              <span className="flex-1">Learn More</span>
                            </StyledDropdownMenuItem>
                          </StyledDropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {/* Add Source button (only for sources mode) - uses filter-aware edit config */}
                      {isSourcesNavigation(navState) && activeWorkspace && (
                        <EditPopover
                          trigger={
                            <HeaderIconButton
                              icon={<Plus className="h-4 w-4" />}
                              tooltip="Add Source"
                              data-tutorial="add-source-button"
                            />
                          }
                          {...getEditConfig(
                            sourceFilter?.kind === 'type' ? `add-source-${sourceFilter.sourceType}` : 'add-source',
                            activeWorkspace.rootPath
                          )}
                        />
                      )}
                      {/* Add Skill button (only for skills mode) */}
                      {isSkillsNavigation(navState) && activeWorkspace && (
                        <EditPopover
                          trigger={
                            <HeaderIconButton
                              icon={<Plus className="h-4 w-4" />}
                              tooltip="Add Skill"
                              data-tutorial="add-skill-button"
                            />
                          }
                          {...getEditConfig('add-skill', activeWorkspace.rootPath)}
                        />
                      )}
                    </>
                  }
                />
                {/* Content: SessionList, SourcesListPanel, or SettingsNavigator based on navigation state */}
                {isSourcesNavigation(navState) && (
                  /* Sources List - filtered by type if sourceFilter is active */
                  <SourcesListPanel
                    sources={sources}
                    sourceFilter={sourceFilter}
                    workspaceRootPath={activeWorkspace?.rootPath}
                    onDeleteSource={handleDeleteSource}
                    onSourceClick={handleSourceSelect}
                    selectedSourceSlug={isSourcesNavigation(navState) && navState.details ? navState.details.sourceSlug : null}
                    localMcpEnabled={localMcpEnabled}
                  />
                )}
                {isSkillsNavigation(navState) && activeWorkspaceId && (
                  /* Skills List */
                  <SkillsListPanel
                    skills={skills}
                    workspaceId={activeWorkspaceId}
                    workspaceRootPath={activeWorkspace?.rootPath}
                    onSkillClick={handleSkillSelect}
                    onDeleteSkill={handleDeleteSkill}
                    selectedSkillSlug={isSkillsNavigation(navState) && navState.details ? navState.details.skillSlug : null}
                  />
                )}
                {isSettingsNavigation(navState) && (
                  /* Settings Navigator */
                  <SettingsNavigator
                    selectedSubpage={navState.subpage}
                    onSelectSubpage={(subpage) => handleSettingsClick(subpage)}
                  />
                )}
                {(isChatsNavigation(navState) || isChatNavigation(navState)) && (
                  /* Sessions List */
                  <>
                    {/* SessionList: Scrollable list of session cards */}
                    {/* Key on sidebarMode forces full remount when switching views, skipping animations */}
                    <SessionList
                      key={chatFilter?.kind}
                      items={filteredSessionMetas}
                      onDelete={handleDeleteSession}
                      onFlag={onFlagSession}
                      onUnflag={onUnflagSession}
                      onMarkUnread={onMarkSessionUnread}
                      onTodoStateChange={onTodoStateChange}
                      onRename={onRenameSession}
                      onFocusChatInput={focusChatInput}
                      onSessionSelect={(selectedMeta) => {
                        // Save to appropriate storage key based on mode
                        if (appMode === 'chat') {
                          storage.set(storage.KEYS.lastChatSessionId, selectedMeta.id)
                          navigate(routes.view.chat(selectedMeta.id))
                        } else {
                          storage.set(storage.KEYS.lastAgentSessionId, selectedMeta.id)
                          // Navigate to the session via central routing (with filter context)
                          if (!chatFilter || chatFilter.kind === 'allChats') {
                            navigate(routes.view.allChats(selectedMeta.id))
                          } else if (chatFilter.kind === 'flagged') {
                            navigate(routes.view.flagged(selectedMeta.id))
                          } else if (chatFilter.kind === 'state') {
                            navigate(routes.view.state(chatFilter.stateId, selectedMeta.id))
                          }
                        }
                      }}
                      onOpenInNewWindow={(selectedMeta) => {
                        if (activeWorkspaceId) {
                          window.electronAPI.openSessionInNewWindow(activeWorkspaceId, selectedMeta.id)
                        }
                      }}
                      onNavigateToView={(view) => {
                        if (appMode === 'chat') {
                          // In chat mode, just navigate to chat view
                          navigate(routes.view.chat())
                        } else {
                          // In agent mode, navigate to appropriate view
                          if (view === 'allChats') {
                            navigate(routes.view.allChats())
                          } else if (view === 'flagged') {
                            navigate(routes.view.flagged())
                          }
                        }
                      }}
                      sessionOptions={sessionOptions}
                      searchActive={searchActive}
                      searchQuery={searchQuery}
                      onSearchChange={setSearchQuery}
                      onSearchClose={() => {
                        setSearchActive(false)
                        setSearchQuery('')
                      }}
                      todoStates={todoStates}
                    />
                  </>
                )}
              </div>
            )}

            {/* Session List Resize Handle (hidden in focused mode) */}
            {!isFocusedMode && (
              <div
                ref={sessionListHandleRef}
                onMouseDown={(e) => { e.preventDefault(); setIsResizing('session-list') }}
                onMouseMove={(e) => {
                  if (sessionListHandleRef.current) {
                    const rect = sessionListHandleRef.current.getBoundingClientRect()
                    setSessionListHandleY(e.clientY - rect.top)
                  }
                }}
                onMouseLeave={() => { if (isResizing !== 'session-list') setSessionListHandleY(null) }}
                className="relative w-0 h-full cursor-col-resize flex justify-center shrink-0"
              >
                {/* Touch area */}
                <div className="absolute inset-y-0 -left-1.5 -right-1.5 flex justify-center cursor-col-resize">
                  <div
                    className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5"
                    style={getResizeGradientStyle(sessionListHandleY)}
                  />
                </div>
              </div>
            )}

            {/* === MAIN CONTENT PANEL === */}
            <div className={cn(
              "flex-1 overflow-hidden min-w-0 bg-foreground-2 shadow-middle",
              isFocusedMode ? "rounded-[14px]" : (isRightSidebarVisible ? "rounded-l-[10px] rounded-r-[10px]" : "rounded-l-[10px] rounded-r-[14px]")
            )}>
              <MainContentPanel key={appMode} isFocusedMode={isFocusedMode} />
            </div>

            {/* Right Sidebar - Inline Mode (≥ 920px) */}
            {!isFocusedMode && !shouldUseOverlay && (
              <>
                {/* Resize Handle */}
                {isRightSidebarVisible && (
                  <div
                    ref={rightSidebarHandleRef}
                    onMouseDown={(e) => { e.preventDefault(); setIsResizing('right-sidebar') }}
                    onMouseMove={(e) => {
                      if (rightSidebarHandleRef.current) {
                        const rect = rightSidebarHandleRef.current.getBoundingClientRect()
                        setRightSidebarHandleY(e.clientY - rect.top)
                      }
                    }}
                    onMouseLeave={() => { if (isResizing !== 'right-sidebar') setRightSidebarHandleY(null) }}
                    className="relative w-0 h-full cursor-col-resize flex justify-center shrink-0"
                  >
                    {/* Touch area */}
                    <div className="absolute inset-y-0 -left-1.5 -right-1.5 flex justify-center cursor-col-resize">
                      <div
                        className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-0.5"
                        style={getResizeGradientStyle(rightSidebarHandleY)}
                      />
                    </div>
                  </div>
                )}

                {/* Inline Sidebar */}
                <motion.div
                  initial={false}
                  animate={{
                    width: isRightSidebarVisible ? rightSidebarWidth : 0,
                    marginLeft: isRightSidebarVisible ? 0 : -PANEL_PANEL_SPACING / 2,
                  }}
                  transition={isResizing === 'right-sidebar' || skipRightSidebarAnimation ? { duration: 0 } : springTransition}
                  className="h-full shrink-0 overflow-visible"
                >
                  <motion.div
                    initial={false}
                    animate={{
                      x: isRightSidebarVisible ? 0 : rightSidebarWidth + PANEL_PANEL_SPACING / 2,
                      opacity: isRightSidebarVisible ? 1 : 0,
                    }}
                    transition={isResizing === 'right-sidebar' || skipRightSidebarAnimation ? { duration: 0 } : springTransition}
                    className="h-full bg-foreground-2 shadow-middle rounded-l-[10px] rounded-r-[14px]"
                    style={{ width: rightSidebarWidth }}
                  >
                    <RightSidebar
                      panel={{ type: 'sessionMetadata' }}
                      sessionId={'details' in navState && navState.details?.type === 'chat' ? (navState.details as any).sessionId : undefined}
                      closeButton={rightSidebarCloseButton}
                    />
                  </motion.div>
                </motion.div>
              </>
            )}

            {/* Right Sidebar - Overlay Mode (< 920px) */}
            {!isFocusedMode && shouldUseOverlay && (
              <AnimatePresence>
                {isRightSidebarVisible && (
                  <>
                    {/* Backdrop */}
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={skipRightSidebarAnimation ? { duration: 0 } : { duration: 0.2 }}
                      className="fixed inset-0 bg-black/25 z-overlay"
                      onClick={() => setIsRightSidebarVisible(false)}
                    />
                    {/* Drawer panel */}
                    <motion.div
                      initial={{ x: 316 }}
                      animate={{ x: 0 }}
                      exit={{ x: 316 }}
                      transition={skipRightSidebarAnimation ? { duration: 0 } : springTransition}
                      className="fixed inset-y-0 right-0 w-[316px] h-screen z-overlay p-1.5"
                    >
                      <div className="h-full bg-foreground-2 overflow-hidden shadow-strong rounded-[12px]">
                        <RightSidebar
                          panel={{ type: 'sessionMetadata' }}
                          sessionId={isChatsNavigation(navState) && navState.details ? navState.details.sessionId : undefined}
                          closeButton={rightSidebarCloseButton}
                        />
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            )}
          </div>
        </div>

        {/* ============================================================================
       * CONTEXT MENU TRIGGERED EDIT POPOVERS
       * ============================================================================
       * These EditPopovers are opened programmatically from sidebar context menus.
       * They use controlled state (editPopoverOpen) and invisible anchors for positioning.
       * Positioned near the sidebar (left side) since that's where context menus originate.
       * modal={true} prevents auto-close when focus shifts after context menu closes.
       */}
        {activeWorkspace && (
          <>
            {/* Configure Statuses EditPopover - anchored near sidebar */}
            <EditPopover
              open={editPopoverOpen === 'statuses'}
              onOpenChange={(isOpen) => setEditPopoverOpen(isOpen ? 'statuses' : null)}
              modal={true}
              trigger={
                <div
                  className="fixed top-[120px] w-0 h-0 pointer-events-none"
                  style={{ left: sidebarWidth + 20 }}
                  aria-hidden="true"
                />
              }
              side="bottom"
              align="start"
              {...getEditConfig('edit-statuses', activeWorkspace.rootPath)}
            />
            {/* Add Source EditPopovers - one for each variant (generic + filter-specific)
           * editPopoverOpen can be: 'add-source', 'add-source-api', 'add-source-mcp', 'add-source-local'
           * Each variant uses its corresponding EditContextKey for filter-aware agent context */}
            {(['add-source', 'add-source-api', 'add-source-mcp', 'add-source-local'] as const).map((variant) => (
              <EditPopover
                key={variant}
                open={editPopoverOpen === variant}
                onOpenChange={(isOpen) => setEditPopoverOpen(isOpen ? variant : null)}
                modal={true}
                trigger={
                  <div
                    className="fixed top-[120px] w-0 h-0 pointer-events-none"
                    style={{ left: sidebarWidth + 20 }}
                    aria-hidden="true"
                  />
                }
                side="bottom"
                align="start"
                {...getEditConfig(variant, activeWorkspace.rootPath)}
              />
            ))}
            {/* Add Skill EditPopover */}
            <EditPopover
              open={editPopoverOpen === 'add-skill'}
              onOpenChange={(isOpen) => setEditPopoverOpen(isOpen ? 'add-skill' : null)}
              modal={true}
              trigger={
                <div
                  className="fixed top-[120px] w-0 h-0 pointer-events-none"
                  style={{ left: sidebarWidth + 20 }}
                  aria-hidden="true"
                />
              }
              side="bottom"
              align="start"
              {...getEditConfig('add-skill', activeWorkspace.rootPath)}
            />
          </>
        )}

      </TooltipProvider>
    </AppShellProvider>
  )
}
