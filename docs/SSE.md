# SSE

This document describes the SSE stream shape used by this app. The goal is that this file alone is enough to implement a client parser.

## Event Envelope

Each SSE message uses a single `data:` line containing a JSON object:

```text
data: {"directory":"/abs/or/relative/path","payload":{"type":"...","properties":{...}}}

```

Common envelope fields:

- `directory`: workspace directory the event belongs to.
  - This field can be omitted for server-level events such as `server.connected` and `server.heartbeat`.
- `payload.type`: event name.
- `payload.properties`: event-specific object.

## Event Types

Below lists each `payload.type` and its `properties` fields.

- `server.connected`
  - `{}`
- `server.heartbeat`
  - `{}`
- `server.instance.disposed`
  - `directory: string`
- `global.disposed`
  - `{}`
- `installation.updated`
  - `version: string`
- `installation.update-available`
  - `version: string`
- `ide.installed`
  - `ide: string`
- `lsp.client.diagnostics`
  - `serverID: string`
  - `path: string`
- `lsp.updated`
  - `{}`
- `message.updated`
  - `info: Message`
- `message.removed`
  - `sessionID: string`
  - `messageID: string`
- `message.part.updated`
  - `part: Part`
- `message.part.delta`
  - `sessionID: string`
  - `messageID: string`
  - `partID: string`
  - `field: string`
  - `delta: string`
- `message.part.removed`
  - `sessionID: string`
  - `messageID: string`
  - `partID: string`
- `permission.asked`
  - `id: string`
  - `sessionID: string`
  - `permission: string`
  - `patterns: string[]`
  - `metadata: object`
  - `always: string[]`
  - `tool?.messageID: string`
  - `tool?.callID: string`
- `permission.replied`
  - `sessionID: string`
  - `requestID: string`
  - `reply: once | always | reject`
- `permission.updated` (deprecated)
  - legacy event. Do not use in new clients.
- `question.asked`
  - `id: string`
  - `sessionID: string`
  - `questions: QuestionInfo[]`
  - `tool?.messageID: string`
  - `tool?.callID: string`
- `question.replied`
  - `sessionID: string`
  - `requestID: string`
  - `answers: string[][]`
- `question.rejected`
  - `sessionID: string`
  - `requestID: string`
- `session.status`
  - `sessionID: string`
  - `status.type: idle | retry | busy`
  - `status.attempt?: number`
  - `status.message?: string`
  - `status.next?: number`
- `session.idle` (deprecated)
  - `sessionID: string`
  - legacy compatibility event. Use `session.status` with `status.type = idle`.
- `session.compacted`
  - `sessionID: string`
- `session.created`
  - `info: Session`
- `session.updated`
  - `info: Session`
- `session.deleted`
  - `info: Session`
- `session.diff`
  - `sessionID: string`
  - `diff: FileDiff[]`
- `session.error`
  - `sessionID?: string`
  - `error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | StructuredOutputError | ContextOverflowError | ApiError`
- `file.edited`
  - `file: string`
- `file.watcher.updated`
  - `file: string`
  - `event: add | change | unlink`
- `todo.updated`
  - `sessionID: string`
  - `todos: Todo[]`
- `command.executed`
  - `name: string`
  - `sessionID: string`
  - `arguments: string`
  - `messageID: string`
- `project.updated`
  - `ProjectInfo`
  - `properties` is the `ProjectInfo` object itself (no `info` wrapper).
- `worktree.ready`
  - `name: string`
  - `branch: string`
- `worktree.failed`
  - `message: string`
- `vcs.branch.updated`
  - `branch?: string`
- `mcp.tools.changed`
  - `server: string`
- `mcp.browser.open.failed`
  - `mcpName: string`
  - `url: string`
- `tui.prompt.append`
  - `text: string`
- `tui.command.execute`
  - `command: string`
- `tui.toast.show`
  - `title?: string`
  - `message: string`
  - `variant: info | success | warning | error`
  - `duration?: number`
- `tui.session.select`
  - `sessionID: string`
- `pty.created`
  - `info: Pty`
- `pty.updated`
  - `info: Pty`
- `pty.exited`
  - `id: string`
  - `exitCode: number`
- `pty.deleted`
  - `id: string`

## Core Payload Shapes

All type names in this section are logical names for documentation.

### Message (Discriminated by `role`)

`Message = UserMessage | AssistantMessage`

`UserMessage`

- `id: string`
- `sessionID: string`
- `role: "user"`
- `time.created: number`
- `format?: OutputFormat`
- `summary?: { title?: string; body?: string; diffs: FileDiff[] }`
- `agent: string`
- `model.providerID: string`
- `model.modelID: string`
- `system?: string`
- `tools?: Record<string, boolean>`
- `variant?: string`

`AssistantMessage`

- `id: string`
- `sessionID: string`
- `role: "assistant"`
- `time.created: number`
- `time.completed?: number`
- `error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | StructuredOutputError | ContextOverflowError | ApiError`
- `parentID: string`
- `modelID: string`
- `providerID: string`
- `mode: string` (deprecated, kept for compatibility)
- `agent: string`
- `path.cwd: string`
- `path.root: string`
- `summary?: boolean`
- `cost: number`
- `tokens.total?: number`
- `tokens.input: number`
- `tokens.output: number`
- `tokens.reasoning: number`
- `tokens.cache.read: number`
- `tokens.cache.write: number`
- `structured?: unknown`
- `variant?: string`
- `finish?: string`

### OutputFormat

`OutputFormat = OutputFormatText | OutputFormatJsonSchema`

`OutputFormatText`

- `type: "text"`

`OutputFormatJsonSchema`

- `type: "json_schema"`
- `schema: Record<string, unknown>`
- `retryCount: number` (default `2`)

### Part (Discriminated by `type`)

All part variants include:

- `id: string`
- `sessionID: string`
- `messageID: string`

`Part = TextPart | ReasoningPart | FilePart | ToolPart | StepStartPart | StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart | SubtaskPart`

`TextPart`

- `type: "text"`
- `text: string`
- `synthetic?: boolean`
- `ignored?: boolean`
- `time?: { start: number; end?: number }`
- `metadata?: Record<string, unknown>`

`ReasoningPart`

- `type: "reasoning"`
- `text: string`
- `metadata?: Record<string, unknown>`
- `time.start: number`
- `time.end?: number`

`FilePart`

- `type: "file"`
- `mime: string`
- `filename?: string`
- `url: string`
- `source?: FilePartSource`

`ToolPart`

- `type: "tool"`
- `callID: string`
- `tool: string`
- `state: ToolState`
- `metadata?: Record<string, unknown>`

`StepStartPart`

- `type: "step-start"`
- `snapshot?: string`

`StepFinishPart`

- `type: "step-finish"`
- `reason: string`
- `snapshot?: string`
- `cost: number`
- `tokens.total?: number`
- `tokens.input: number`
- `tokens.output: number`
- `tokens.reasoning: number`
- `tokens.cache.read: number`
- `tokens.cache.write: number`

`SnapshotPart`

- `type: "snapshot"`
- `snapshot: string`

`PatchPart`

- `type: "patch"`
- `hash: string`
- `files: string[]`

`AgentPart`

- `type: "agent"`
- `name: string`
- `source?: { value: string; start: number; end: number }`

`RetryPart`

- `type: "retry"`
- `attempt: number`
- `error: ApiError`
- `time.created: number`

`CompactionPart`

- `type: "compaction"`
- `auto: boolean`

`SubtaskPart`

- `type: "subtask"`
- `prompt: string`
- `description: string`
- `agent: string`
- `model?: { providerID: string; modelID: string }`
- `command?: string`

### ToolState (Discriminated by `status`)

`ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError`

`ToolStatePending`

- `status: "pending"`
- `input: Record<string, unknown>`
- `raw: string`

`ToolStateRunning`

- `status: "running"`
- `input: Record<string, unknown>`
- `title?: string`
- `metadata?: Record<string, unknown>`
- `time.start: number`

`ToolStateCompleted`

- `status: "completed"`
- `input: Record<string, unknown>`
- `output: string`
- `title: string`
- `metadata: Record<string, unknown>`
- `time.start: number`
- `time.end: number`
- `time.compacted?: number`
- `attachments?: FilePart[]`

`ToolStateError`

- `status: "error"`
- `input: Record<string, unknown>`
- `error: string`
- `metadata?: Record<string, unknown>`
- `time.start: number`
- `time.end: number`

### FilePartSource (Discriminated by `type`)

`FilePartSource = FileSource | SymbolSource | ResourceSource`

`FileSource`

- `type: "file"`
- `path: string`
- `text.value: string`
- `text.start: number`
- `text.end: number`

`SymbolSource`

- `type: "symbol"`
- `path: string`
- `name: string`
- `kind: number`
- `range.start.line: number`
- `range.start.character: number`
- `range.end.line: number`
- `range.end.character: number`
- `text.value: string`
- `text.start: number`
- `text.end: number`

`ResourceSource`

- `type: "resource"`
- `clientName: string`
- `uri: string`
- `text.value: string`
- `text.start: number`
- `text.end: number`

## Other Shared Shapes

`FileDiff`

- `file: string`
- `before: string`
- `after: string`
- `additions: number`
- `deletions: number`

`Session`

- `id: string`
- `projectID: string`
- `directory: string`
- `parentID?: string`
- `title: string`
- `version: string`
- `time.created: number`
- `time.updated: number`
- `time.compacting?: number`
- `summary?.additions: number`
- `summary?.deletions: number`
- `summary?.files: number`
- `summary?.diffs?: FileDiff[]`
- `share?.url?: string`
- `revert?.messageID?: string`
- `revert?.partID?: string`
- `revert?.snapshot?: string`
- `revert?.diff?: string`

`Todo`

- `content: string`
- `status: pending | in_progress | completed | cancelled`
- `priority: high | medium | low`
- `id: string`

`Pty`

- `id: string`
- `title: string`
- `command: string`
- `args: string[]`
- `cwd: string`
- `status: running | exited`
- `pid: number`

## Error Shapes

`ProviderAuthError`

- `name: "ProviderAuthError"`
- `data.providerID: string`
- `data.message: string`

`UnknownError`

- `name: "UnknownError"`
- `data.message: string`

`MessageOutputLengthError`

- `name: "MessageOutputLengthError"`
- `data: object`

`MessageAbortedError`

- `name: "MessageAbortedError"`
- `data.message: string`

`StructuredOutputError`

- `name: "StructuredOutputError"`
- `data.message: string`
- `data.retries: number`

`ContextOverflowError`

- `name: "ContextOverflowError"`
- `data.message: string`
- `data.responseBody?: string`

`ApiError`

- `name: "APIError"`
- `data.message: string`
- `data.statusCode?: number`
- `data.isRetryable: boolean`
- `data.responseHeaders?: Record<string, string>`
- `data.responseBody?: string`
- `data.metadata?: Record<string, string>`

## UI Notes

The frontend tool windows are rendered from `Part.type === "tool"` events.

- `pending`: not rendered.
- `running`: rendered when content is available.
- `completed` / `error`: status is updated and window expires after about 2 seconds.
