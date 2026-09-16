import type { OpenCodeEvent } from '@opencode/client';
import type { Connection } from '../utils/protocol/client';

export type EventCommand =
  | { type: 'connect'; connection: Connection }
  | { type: 'disconnect' }
  | { type: 'heartbeat' }
  | { type: 'attention'; sessionID?: string };

export type EventMessage =
  | { type: 'events'; events: OpenCodeEvent[] }
  | { type: 'idle-notifications'; sessionIDs: string[] }
  | { type: 'notify'; sessionID: string; kind: 'idle' | 'permission' | 'question' }
  | { type: 'status'; status: 'connecting' | 'connected' | 'reconnecting'; error?: string };
