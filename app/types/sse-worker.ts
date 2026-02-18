import type { ProjectInfo, SsePacket } from './sse';
import type { ProjectState, WorkerNotificationEntry } from './worker-state';

export type TabToWorkerMessage =
  | {
      type: 'connect';
      baseUrl: string;
      authorization?: string;
    }
  | {
      type: 'disconnect';
    }
  | {
      type: 'session.mutated';
      info: {
        id: string;
        projectID?: string;
        directory?: string;
        title?: string;
        slug?: string;
        parentID?: string;
        time?: {
          created?: number;
          updated?: number;
          archived?: number;
        };
      };
    }
  | {
      type: 'session.removed';
      sessionId: string;
      projectId?: string;
    }
  | {
      type: 'project.mutated';
      info: ProjectInfo;
    }
  | {
      type: 'selection.active';
      key: string;
    };

export type WorkerToTabMessage =
  | {
      type: 'packet';
      packet: SsePacket;
    }
  | {
      type: 'connection.open';
    }
  | {
      type: 'connection.error';
      message: string;
      statusCode?: number;
    }
  | {
      type: 'connection.reconnected';
    }
  | {
      type: 'state.bootstrap';
      projects: Record<string, ProjectState>;
      notifications: Record<string, WorkerNotificationEntry>;
    }
  | {
      type: 'state.project-updated';
      projectId: string;
      project: ProjectState;
    }
  | {
      type: 'state.project-removed';
      projectId: string;
    }
  | {
      type: 'state.notifications-updated';
      notifications: Record<string, WorkerNotificationEntry>;
    }
  | {
      type: 'notification.show';
      key: string;
      kind: 'permission' | 'question' | 'idle';
    };
