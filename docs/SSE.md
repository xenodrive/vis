# OpenCode V2 event synchronization

## Transport

`app/workers/v2-events.ts` consumes the official Promise client's `event.subscribe()` async iterable. It does not parse SSE frames or issue requests to V1's `/global/event` endpoint.

Each URL/password combination owns one client and event source shared by connected tabs. Events are batched for delivery to Vue. The last subscriber disconnecting aborts the source. Page lifecycle messages and heartbeat leases release abandoned subscriptions.

The official event stream is live-only. A transport failure ends the iterable. The worker explicitly subscribes again with bounded exponential delay and reports its connection state. vis does not switch transports or attempt V1 endpoints.

## Event shape

Use the generated `OpenCodeEvent` union. Native events have `type`, `data`, optional `location` and event metadata. Durable session events also carry aggregate sequence metadata. This is distinct from V1's `directory/payload/properties` envelope.

Text and reasoning deltas identify an assistant message and an ordinal within that content kind. Tool events identify the tool invocation. `app/v2/transcript.ts` projects these directly into `SessionMessageInfo` values. End events supply authoritative complete text and structured results.

## Snapshots and recovery

The main thread owns the displayed session, transcript, catalogs, requests and inbox. It uses official client reads to hydrate state and revalidate after durable events. Delta bursts update the transcript locally rather than issuing one HTTP request per token.

Reads are scoped to the current connection and selection. Late responses from a previous selection are ignored. A message modified by events during a read is retained instead of being overwritten by that read's snapshot. Overlapping message reads retain the newer snapshot. Pagination merges by message ID.

After reconnection, the selected transcript and its cursor are reset and fetched again. Active sessions, session listings, requests and inbox are revalidated. Missing events are not treated as an empty state or a successful operation. Request settlement invalidates in-flight request snapshots.

The experimental durable session log is not used as a substitute for the live global stream. It does not replay all volatile events.
