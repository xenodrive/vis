import type { SessionMessageAssistantTool } from '@opencode-ai/client';

/** Display records consumed by thread and floating-window components. */
export type MessageError = {
  name: string;
  data?: Record<string, unknown>;
};

export type UserMessageInfo = {
  id: string;
  sessionID: string;
  role: 'user';
  time: { created: number };
  summary?: {
    title?: string;
    body?: string;
    diffs: Array<{
      file: string;
      patch: string;
      additions: number;
      deletions: number;
      status?: 'added' | 'deleted' | 'modified';
    }>;
  };
  agent?: string;
  model?: { providerID: string; modelID: string };
  variant?: string;
};

export type AssistantMessageInfo = {
  id: string;
  sessionID: string;
  role: 'assistant';
  time: { created: number; completed?: number };
  error?: MessageError;
  parentID?: string;
  modelID: string;
  providerID: string;
  agent: string;
  summary?: boolean;
  cost?: number;
  tokens?: MessageTokens;
  variant?: string;
  finish?: string;
};

export type MessageInfo = UserMessageInfo | AssistantMessageInfo;

type PartBase = {
  id: string;
  sessionID: string;
  messageID: string;
};

export type TextPart = PartBase & {
  type: 'text';
  text: string;
  synthetic?: boolean;
};

export type ReasoningPart = PartBase & {
  type: 'reasoning';
  text: string;
  time: { start: number; end?: number };
};

export type ToolState =
  | { status: 'pending'; input: Record<string, unknown>; raw: string }
  | {
      status: 'running';
      input: Record<string, unknown>;
      title?: string;
      metadata?: Record<string, unknown>;
      time: { start: number };
    }
  | {
      status: 'completed';
      input: Record<string, unknown>;
      output: string;
      title: string;
      metadata: Record<string, unknown>;
      time: { start: number; end: number };
    }
  | {
      status: 'error';
      input: Record<string, unknown>;
      error: string;
      metadata?: Record<string, unknown>;
      time: { start: number; end: number };
    };

export type ToolPart = PartBase & {
  invocation: SessionMessageAssistantTool;
  type: 'tool';
  callID: string;
  tool: string;
  state: ToolState;
};

export type FilePart = PartBase & {
  type: 'file';
  mime: string;
  filename?: string;
  url: string;
};

export type MessagePart = TextPart | ReasoningPart | ToolPart | FilePart;

export type QuestionInfo = {
  question: string;
  header: string;
  options: Array<{ label: string; description: string }>;
  multiple?: boolean;
  custom?: boolean;
};

export type MessageTokens = {
  input: number;
  output: number;
  reasoning: number;
  total?: number;
  cache?: {
    read: number;
    write: number;
  };
};

export type MessageUsage = {
  tokens: MessageTokens;
  cost?: number;
  providerId?: string;
  modelId?: string;
  contextPercent?: number | null;
};

export type MessageAttachment = {
  id: string;
  url: string;
  mime: string;
  filename: string;
};

export type MessageDiffEntry = {
  file: string;
  before: string;
  after: string;
};

export type MessageStatus = 'streaming' | 'complete' | 'error';

export type Message = {
  id: string;
  parentId?: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  status: MessageStatus;

  agent?: string;
  model?: string;
  providerId?: string;
  modelId?: string;
  variant?: string;

  time?: number;
  usage?: MessageUsage;
  attachments?: MessageAttachment[];
  diffs?: MessageDiffEntry[];
  error?: { name: string; message: string } | null;
  classification?: 'real_user' | 'system_injection' | 'unknown';
};

export type HistoryEntry =
  | { kind: 'message'; message: MessageInfo; time: number }
  | { kind: 'tool'; part: ToolPart; time: number }
  | { kind: 'reasoning'; part: ReasoningPart; time: number }
  | { kind: 'question'; part: ToolPart; time: number };

export type HistoryWindowEntry =
  | { key: string; kind: 'message'; content: string; time: number; agent?: string }
  | { key: string; kind: 'tool'; part: ToolPart; time: number }
  | { key: string; kind: 'reasoning'; part: ReasoningPart; time: number }
  | {
      key: string;
      kind: 'question';
      questions: QuestionInfo[];
      status: 'pending' | 'replied' | 'rejected';
      answers?: string[][];
      time: number;
    };

export type ModelMeta = {
  displayName: string;
  providerLabel?: string;
};

export type ThreadTarget = {
  agent?: string;
  modelDisplayName?: string;
  providerLabel?: string;
  variant?: string;
};
