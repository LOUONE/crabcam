export type Phase = 'plan' | 'design' | 'delegate' | 'review' | 'close'

export type PlannedTask = {
  title: string
  tier: string
  after: number[]
}

export type Flow = {
  title: string
  total: number
  done: number
  running: number
  phase: Phase
  isFinished: boolean
  tasks: PlannedTask[]
}

export type AgentStatus = 'running' | 'done' | 'failed'

export type ActivityKind = 'explore' | 'edit' | 'run' | 'web' | 'agent' | 'other'

/** One tool call of an agent, as the panel keeps it. */
export type ActivityEvent = {
  at: number
  tool: string
  kind: ActivityKind
  target: string
  text: string
}

/** A file an agent read or edited. */
export type FileTouch = {
  path: string
  reads: number
  edits: number
  lastAt: number
}

/** The narrator's latest sentence about an agent, and how many calls it had seen. */
export type Narration = {
  text: string
  at: number
  upTo: number
}

export type AgentRun = {
  id: string
  agentId?: string
  type: string
  description: string
  model: string
  effort?: string
  status: AgentStatus
  startedAt: number
  endedAt?: number
  contextTokens: number
  contextMax: number
  tokens: number
  costUsd: number
  steps: number
  round: number
  /** Self-reported by the worker through the `step` tool. */
  stepDone?: number
  stepTotal?: number
  stepNote?: string
  /** Last tool calls of the agent, one short line each, newest last. Read from the engine's events. */
  activity?: string[]
  activityAt?: number
  events?: ActivityEvent[]
  eventCount?: number
  files?: FileTouch[]
  narration?: Narration
  narratorUsd?: number
}

export type Panel = {
  isCompact: boolean
  isDoneCollapsed: boolean
  isLogOpen?: boolean
  /** The agent open in detail, by its run id. */
  selected?: string
  autoOpenedFor: string
}

declare module 'claude-code' {
  interface PluginState {
    'savvy-progress': {
      flow: Flow | null
      agents: AgentRun[]
      panel: Panel
      now: number
    }
  }
}
