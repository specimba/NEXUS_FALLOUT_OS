// ============================================================
// NEXUS OS — shared types
// Bio-Pip-Cyberpunk AI Operating System
// ============================================================

// ----- File system ----------------------------------------------------

export type FSNode = {
  id: string
  name: string
  type: 'file' | 'dir'
  parentId: string | null
  /** File contents (only present when type === 'file'). */
  content?: string
  createdAt: number
  updatedAt: number
}

/** Flat id-map of every node in the filesystem. Root has id 'root'. */
export type FSMap = Record<string, FSNode>

// ----- Windows --------------------------------------------------------

export type WindowGeometry = {
  x: number
  y: number
  w: number
  h: number
}

export type WindowState = {
  id: string
  appId: string
  title: string
  x: number
  y: number
  w: number
  h: number
  z: number
  minimized: boolean
  maximized: boolean
  /** Snapshot of geometry to restore from maximize. */
  prevState?: WindowGeometry
}

// ----- Apps -----------------------------------------------------------

export type AppId =
  | 'terminal'
  | 'nexus-ai'
  | 'browser'
  | 'settings'
  | 'command-center'
  | 'web-agent'
  | 'files'
  | 'file-manager'
  | 'code-editor'
  | 'notepad'

export type AppCategory = 'system' | 'dev' | 'ai' | 'network' | 'apps'

export type WindowComponentProps = {
  windowId: string
}

export type AppDef = {
  id: AppId
  name: string
  /** Icon — either a lucide-react element or any ReactNode (string emoji). */
  icon: React.ReactNode
  component: React.ComponentType<WindowComponentProps>
  /** Default window geometry. x/y are optional (omit for cascade positioning). */
  defaultSize: { x?: number; y?: number; w: number; h: number }
  /** Minimum window size. x/y are optional. */
  minSize?: { x?: number; y?: number; w: number; h: number }
  singleton?: boolean
  pinned?: boolean
  category?: AppCategory
  title?: string
}

// ----- Theme / visual settings ---------------------------------------

export type ThemeId = 'green' | 'amber' | 'cyan' | 'white'

export type CrtQuality = 'static' | 'subtle' | 'full'

export type WallpaperId = 'grid' | 'scanlines' | 'noise' | 'aurora' | 'void'

// ----- OS phase -------------------------------------------------------

export type OSPhase = 'boot' | 'lock' | 'desktop'

// ----- Terminal output ------------------------------------------------

export type OutputLine = {
  type: 'text' | 'error' | 'success' | 'dim' | 'ascii'
  text: string
}

export type CommandResult = {
  output?: string | OutputLine[]
  /** Clear the scrollback before printing this output. */
  clear?: boolean
  /** Exit the shell (used by `exit`). */
  exit?: boolean
  /** Open a manual / help window. */
  openManual?: string
}

// ----- Command context (passed to every command handler) -------------

export type CommandContext = {
  cwd: string
  setCwd: (path: string) => void
  fs: FSMap
  writeFile: (path: string, content: string) => string | null
  createDir: (path: string) => string | null
  remove: (path: string) => boolean
  move: (from: string, to: string) => boolean
  copy: (from: string, to: string) => boolean
  /** Push one or more lines onto the terminal scrollback. */
  pushLine: (line: OutputLine | OutputLine[]) => void
  /** Clear the scrollback. */
  clearLines: () => void
  /** Register a stop function for the currently-running command. */
  registerStop: (stop: () => void) => void
  theme: ThemeId
  setTheme: (t: ThemeId) => void
  crt: boolean
  setCrt: (v: boolean) => void
  sound: boolean
  setSound: (v: boolean) => void
  username: string
  openApp: (appId: AppId, opts?: { title?: string }) => void
}

// ----- Agent runs (Command Center / Web Agent) -----------------------

export type AgentStepStatus = 'pending' | 'running' | 'done' | 'error' | 'awaiting-approval'

export type AgentStep = {
  id: string
  /** Step label, e.g. "scrape", "extract", "synthesize". */
  label: string
  status: AgentStepStatus
  startedAt?: number
  endedAt?: number
  /** Free-form detail payload (JSON string, log lines, etc.). */
  detail?: string
}

export type AgentRunStatus =
  | 'pending'
  | 'running'
  | 'awaiting-approval'
  | 'done'
  | 'error'
  | 'cancelled'

export type AgentRun = {
  id: string
  /** Recipe / pipeline id, e.g. "scrape→extract→judge". */
  recipe: string
  /** The user task description. */
  task: string
  /** LLM engine used (provider/model id). */
  engine: string
  status: AgentRunStatus
  startedAt: number
  endedAt?: number
  steps: AgentStep[]
  finalResult?: string
  error?: string
  /** Prompt shown to the user when approval is required. */
  approvalPrompt?: string
  /** Bill of materials / token accounting (opaque string). */
  bon?: string
  /** Where this run originated (e.g. "command-center", "web-agent"). */
  source?: string
}
