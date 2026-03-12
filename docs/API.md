# OpenCode V2 API integration

## Official contract

- [V1 migration](https://opencode.ai/v2/docs/migrate-v1/)
- [Promise client](https://opencode.ai/v2/docs/build/client)
- [API reference](https://opencode.ai/v2/docs/api)
- The connected service's `/openapi.json`

vis uses `@opencode-ai/client@0.0.0-beta-19192`. Use its exported types for server data and its Promise methods for requests. The existing visual components receive a display projection; no V1 compatibility requests or events are generated.

## Application boundaries

- `app/v2/connection.ts`: client construction and Basic authentication.
- `app/composables/useV2.ts`: Vue state, reads, pagination and user actions.
- `app/workers/v2-events.ts`: one event source per connection across tabs.
- `app/v2/transcript.ts`: live V2 transcript projection.
- `app/v2/forms.ts`: conditional form fields and answer preparation.
- `app/v2/presentation.ts`: V2 transcripts projected into the existing thread component contracts.
- `app/composables/useV2Windows.ts`: floating tool, reasoning, subagent and request windows.
- `app/composables/useWorkspaceLayout.ts`: existing panel sizing and floating canvas geometry.
- `app/composables/useV2FileTree.ts`: location-scoped directory loading and file viewer lifecycle.
- `app/v2/files.ts`: tree projection and UTF-8/binary classification.
- `app/v2/file-index.ts`: bounded recursive traversal and hierarchical `.gitignore` evaluation using the `ignore` package.
- `app/v2/tool-output.ts`: V2 tool content/metadata decoded for specialized floating views.
- `app/v2/pty.ts`: standard PTY operations, connection tickets and replay cursor decoding.
- `app/composables/useV2Pty.ts`: terminal window lifecycle and Location-scoped restoration.
- `app/components/v2/`: dynamic forms and pending input content within floating windows.

The browser receives the service URL and password from the user. It does not use the Node-only Service API or the embedded SDK. There is no launcher or API proxy.

## Data and operations

Sessions own their Location, agent and model. Existing-session operations identify the session directly; location-scoped catalogs and pending requests use the client's `location` input.

Session and message lists return `data` and opaque pagination cursors. Resource methods have generated return types; not every response has the same envelope.

Messages are a discriminated union. User messages have text and attachments; assistant messages contain text, reasoning and tool content. Tool results contain structured content. System, synthetic, compaction, shell and selection-change messages have their own presentations.

Tool history retains the native `SessionMessageAssistantTool` alongside the existing display part. The server plugins persist model-facing `content` and `metadata`, not the plugin's internal typed `output`. Read text uses a `Read file ..., lines N-M` header and `N: ` prefixes; the UI extracts exact source gutters and keeps truncation notices separately. Patch/edit diffs come from `metadata.files`, including their original hunk ranges. Write displays submitted `input.content` (the server formatter may subsequently change it). Shell content separates output and result notices. Running tools display arguments/progress state until their completed result arrives. No current-file reads are substituted for recorded tool output.

Agent/model changes use `session.switchAgent` and `session.switchModel`. `session.prompt` admits text to the inbox with a `queue` or `steer` delivery policy. Admission is not execution completion. `session.interrupt` interrupts execution; `session.inbox.cancel` removes a pending input.

Permission replies use `sessionID`, `requestID` and `reply`. Forms use `sessionID`, `formID` and a keyed answer object. Request snapshots cover discovered session locations and locations observed in live request events. Global forms retain their Location for reply headers.

## Disabled functionality

File browsing uses `file.list` for direct children and `file.read` for bytes. A background traversal preloads unignored directories without expanding the visible tree. Directory loads share in-flight requests and evaluate `.gitignore` files at each level, including repository ancestors when the Location is a subdirectory. `.git` and `node_modules` are always excluded from automatic descent. Excluded entries retain the existing dimmed styling; manual expansion loads them without adding ignored paths to the reference index. Traversal uses four concurrent loads and scheduling thresholds of 300 directories, 20,000 entries and depth 12. The reference index is published in batches. It is reused within the same Location and rebuilt on reload or file changes. Requests retain the Location workspace and are cancelled when leaving that Location. No per-reference `file.find` requests are made. File viewers decode UTF-8 text and retain original bytes for image and binary rendering.

Git state uses `vcs.get` and `vcs.status`; diff windows use `vcs.diff({ mode: 'working' })`. No shell commands are used for Git reads. The API combines staged and unstaged changes, so the tree exposes Changes and All files. Filesystem events invalidate the tree and Git snapshot with a debounce. Obsolete responses are discarded after a selection change.

PTY uses `pty.create/list/update/remove` and `pty.connect.token` with `x-opencode-ticket: 1`. The WebSocket URL contains a single-use ticket and Location, never Basic credentials. Server frames are UTF-8 terminal output; NUL-prefixed binary JSON carries the absolute replay cursor. Cursor increments use JavaScript string length, matching the server. Window resizing updates both xterm and the server viewport.

Archive, worktree mutation, project settings, fork/revert, message editing and attachment submission remain disabled. The Todo and Staged tabs have been removed. The existing layout, thread components and floating window manager are reused; V1 transport composables are not activated.
