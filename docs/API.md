# API integration

## Official contract

- [Promise client](https://opencode.ai/v2/docs/build/client)
- [API reference](https://opencode.ai/v2/docs/api)
- The connected service's `/openapi.json`

vis targets the OpenCode V2 API and uses `@opencode-ai/client@0.0.0-beta-19192`. Use its exported types for server data and its Promise methods for requests. Visual components receive application-owned display records.

## Application boundaries

Code is organized by responsibility within `utils/`, `composables/`, `types/` and `components/`. Only wire contracts and server-specific decoding belong in `utils/protocol/`.

- `app/utils/protocol/client.ts`: client construction and Basic authentication.
- `app/utils/protocol/transcript.ts`: live server transcript projection and snapshot merging.
- `app/utils/protocol/tool-output.ts`: server tool content/metadata decoded for specialized floating views.
- `app/utils/protocol/pty.ts`: PTY operations, connection tickets and replay cursor decoding.
- `app/composables/useConnection.ts`: HTTP client lifecycle, request cancellation and shared event transport.
- `app/composables/useSessionState.ts`: session state, reads, pagination, event reconciliation and user actions.
- `app/workers/events.ts`: one event source per connection across tabs.
- `app/types/event-worker.ts`: tab/worker message contracts.
- `app/types/message.ts`: thread and activity display records; these are not wire event schemas.
- `app/types/files.ts` and `app/types/git.ts`: shared file-tree and Git types.
- `app/types/pending-prompt.ts`: outgoing prompt presentation state.
- `app/utils/messagePresentation.ts`: server transcripts projected into thread display records.
- `app/utils/forms.ts`: conditional form fields and answer preparation.
- `app/utils/composerDrafts.ts`: composer draft storage.
- `app/utils/projects.ts`: project ordering and display colors.
- `app/utils/sessionSettings.ts`: coordinated session agent/model updates.
- `app/utils/errors.ts`: user-facing error messages.
- `app/utils/files.ts`: tree projection and UTF-8/binary classification.
- `app/utils/fileIndex.ts`: bounded recursive traversal and hierarchical `.gitignore` evaluation using the `ignore` package.
- `app/utils/git/`: Git commands, path decoding and bounded diff previews.
- `app/utils/terminal.ts`: terminal presentation constants.
- `app/composables/useSessionWindows.ts`: floating tool, reasoning, subagent and request windows.
- `app/composables/useSessionActivity.ts`: session activity history and selection notifications.
- `app/composables/useWorkspaceLayout.ts`: panel sizing and floating canvas geometry.
- `app/composables/useFileTree.ts`: location-scoped directory loading and file viewer lifecycle.
- `app/composables/useGitControls.ts`: branch inspection and Git controls.
- `app/composables/useTerminalWindows.ts`: terminal window lifecycle and Location-scoped restoration.
- `app/components/ToolWindow/`: tool output, dynamic forms and activity content within floating windows.
- `app/components/git/`: working diffs, diff files and Git changes dialogs.
- `app/components/terminal/`: embedded terminal rendering.
- `app/components/SessionPicker.vue` and `app/components/PendingInputs.vue`: session selection and queued input controls.

The browser receives the service URL and password from the user. It does not use the Node-only Service API or the embedded SDK. There is no launcher or API proxy.

## Data and operations

Sessions own their Location, agent and model. Existing-session operations identify the session directly; location-scoped catalogs and pending requests use the client's `location` input.

Session and message lists return `data` and opaque pagination cursors. Resource methods have generated return types; not every response has the same envelope.

Messages are a discriminated union. User messages have text and attachments; assistant messages contain text, reasoning and tool content. Tool results contain structured content. System, synthetic, compaction, shell and selection-change messages have their own presentations.

Tool history retains the native `SessionMessageAssistantTool` in the required `ToolPart.invocation` field alongside its display state. The server plugins persist model-facing `content` and `metadata`, not the plugin's internal typed `output`. Read text uses a `Read file ..., lines N-M` header and `N: ` prefixes; the UI extracts exact source gutters and keeps truncation notices separately. Patch/edit diffs come from `metadata.files`, including their original hunk ranges. Write displays submitted `input.content` (the server formatter may subsequently change it). Shell content separates output and result notices. Running tools display arguments/progress state until their completed result arrives. No current-file reads are substituted for recorded tool output.

Agent/model changes use `session.switchAgent` and `session.switchModel`. `session.prompt` admits text to the inbox with a `queue` or `steer` delivery policy. Admission is not execution completion. `session.interrupt` interrupts execution; `session.inbox.cancel` removes a pending input.

Permission replies use `sessionID`, `requestID` and `reply`. Forms use `sessionID`, `formID` and a keyed answer object. Request snapshots cover discovered session locations and locations observed in live request events. Global forms retain their Location for reply headers.

## Files, Git and terminals

File browsing uses `file.list` for direct children and `file.read` for bytes. A background traversal preloads unignored directories without expanding the visible tree. Directory loads share in-flight requests and evaluate `.gitignore` files at each level, including repository ancestors when the Location is a subdirectory. `.git` and `node_modules` are always excluded from automatic descent. Excluded entries retain the existing dimmed styling; manual expansion loads them without adding ignored paths to the reference index. Traversal uses four concurrent loads and scheduling thresholds of 300 directories, 20,000 entries and depth 12. The reference index is published in batches. It is reused within the same Location and rebuilt on reload or file changes. Requests retain the Location workspace and are cancelled when leaving that Location. No per-reference `file.find` requests are made. File viewers decode UTF-8 text and retain original bytes for image and binary rendering.

Git state uses `vcs.get` and `vcs.status`. Git controls and changes dialogs also execute commands through the shell API for branch inspection, staged/unstaged diff previews, staging and commits. Git command construction and preview decoding live in `app/utils/git/`; UI lifecycle stays in composables and components. Filesystem events invalidate the tree and Git snapshot with a debounce. Obsolete responses are discarded after a selection change.

PTY uses `pty.create/list/update/remove` and `pty.connect.token` with `x-opencode-ticket: 1`. The WebSocket URL contains a single-use ticket and Location, never Basic credentials. Server frames are UTF-8 terminal output; NUL-prefixed binary JSON carries the absolute replay cursor. Cursor increments use JavaScript string length, matching the server. Window resizing updates both xterm and the server viewport.

The layout, thread components and floating window manager share application display types. Event synchronization uses the generated server types directly and updates the display projection through `app/utils/messagePresentation.ts`.
