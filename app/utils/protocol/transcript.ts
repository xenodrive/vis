import type {
  OpenCodeEvent,
  SessionMessageInfo,
  SessionMessageAssistant,
} from '@opencode-ai/client';

export function mergeMessages(current: SessionMessageInfo[], incoming: SessionMessageInfo[]) {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) map.set(message.id, message);
  return [...map.values()].sort((a, b) => a.id.localeCompare(b.id));
}

/** A live Thought window belongs to the latest assistant step, never the entire transcript. */
export function latestThinking(messages: SessionMessageInfo[]) {
  const message = messages.findLast((message) => message.type === 'assistant');
  if (!message || message.type !== 'assistant')
    return { entries: [], running: false, assistantRunning: false };
  return {
    entries: message.content.flatMap((content, index) =>
      content.type === 'reasoning'
        ? [{ id: `${message.id}:reasoning:${index}`, text: content.text }]
        : [],
    ),
    running:
      message.time.completed === undefined &&
      message.content.some(
        (content) => content.type === 'reasoning' && content.time?.completed === undefined,
      ),
    assistantRunning: message.time.completed === undefined,
  };
}

/** Keep live changes and newer overlapping reads when a snapshot arrives late. */
export function mergeMessageSnapshot(
  current: SessionMessageInfo[],
  incoming: SessionMessageInfo[],
  revisions: {
    startedAt: number;
    read: number;
    touched: ReadonlyMap<string, number>;
    snapshots: Map<string, number>;
  },
) {
  // Deltas are live-only until the block ends. A later HTTP read can still
  // contain empty text, so retain event-owned steps until they finish.
  const streaming = new Set(
    current
      .filter(
        (message) =>
          message.type === 'assistant' &&
          message.time.completed === undefined &&
          revisions.touched.has(message.id),
      )
      .map((message) => message.id),
  );
  const accepted = incoming.filter(
    (message) =>
      !streaming.has(message.id) &&
      (revisions.touched.get(message.id) ?? 0) <= revisions.startedAt &&
      (revisions.snapshots.get(message.id) ?? 0) < revisions.read,
  );
  for (const message of accepted) revisions.snapshots.set(message.id, revisions.read);
  return mergeMessages(current, accepted);
}

export function eventSessionID(event: OpenCodeEvent): string | undefined {
  if ('sessionID' in event.data && typeof event.data.sessionID === 'string')
    return event.data.sessionID;
  if (event.type === 'form.created') return event.data.form.sessionID;
  return undefined;
}

/** Apply live transcript events directly to the server message model. */
export function applyTranscriptEvent(
  messages: SessionMessageInfo[],
  event: OpenCodeEvent,
): string | undefined {
  if (event.type === 'session.step.started') {
    const existing = messages.find((message) => message.id === event.data.assistantMessageID);
    if (existing?.type === 'assistant') {
      existing.agent = event.data.agent;
      existing.model = event.data.model;
      existing.retry = undefined;
      existing.error = undefined;
      existing.finish = undefined;
      existing.time.completed = undefined;
    } else {
      messages.push({
        id: event.data.assistantMessageID,
        type: 'assistant',
        agent: event.data.agent,
        model: event.data.model,
        content: [],
        time: { created: event.created },
      });
    }
    return event.data.assistantMessageID;
  }
  if (!('assistantMessageID' in event.data)) return undefined;
  const assistantMessageID = event.data.assistantMessageID;
  const message = messages.find(
    (item): item is SessionMessageAssistant =>
      item.type === 'assistant' && item.id === assistantMessageID,
  );
  if (!message) return undefined;

  switch (event.type) {
    case 'session.text.started':
      if (!message.content.filter((part) => part.type === 'text')[event.data.ordinal]) {
        message.content.push({ type: 'text', text: '' });
      }
      break;
    case 'session.reasoning.started':
      if (!message.content.filter((part) => part.type === 'reasoning')[event.data.ordinal]) {
        message.content.push({
          type: 'reasoning',
          text: '',
          time: { created: event.created },
          state: event.data.state,
        });
      }
      break;
    case 'session.text.delta':
    case 'session.text.ended':
    case 'session.reasoning.delta':
    case 'session.reasoning.ended': {
      const kind = event.type.startsWith('session.text.') ? 'text' : 'reasoning';
      const part = message.content.filter((part) => part.type === kind)[event.data.ordinal];
      if (!part || part.type === 'tool') return undefined;
      if ('delta' in event.data) part.text += event.data.delta;
      else part.text = event.data.text;
      break;
    }
    case 'session.step.streamed':
      message.time.streamed = event.created;
      break;
    case 'session.step.ended':
      message.time.completed = event.created;
      message.finish = event.data.finish;
      message.tokens = event.data.tokens;
      message.cost = event.data.cost;
      message.retry = undefined;
      break;
    case 'session.step.failed':
      message.time.completed = event.created;
      message.finish = 'error';
      message.error = event.data.error;
      message.retry = undefined;
      break;
    case 'session.retry.scheduled':
      message.retry = { attempt: event.data.attempt, at: event.data.at, error: event.data.error };
      break;
    case 'session.tool.input.started':
      if (!message.content.some((part) => part.type === 'tool' && part.id === event.data.id)) {
        message.content.push({
          type: 'tool',
          id: event.data.id,
          name: event.data.name,
          time: { created: event.created },
          state: { status: 'streaming', input: '' },
        });
      }
      break;
    case 'session.tool.input.delta':
    case 'session.tool.input.ended':
    case 'session.tool.called':
    case 'session.tool.progress':
    case 'session.tool.success':
    case 'session.tool.failed': {
      const tool = message.content.find(
        (part) => part.type === 'tool' && part.id === event.data.id,
      );
      if (!tool || tool.type !== 'tool') return undefined;
      switch (event.type) {
        case 'session.tool.input.delta':
          if (tool.state.status === 'streaming') tool.state.input += event.data.delta;
          break;
        case 'session.tool.input.ended':
          if (tool.state.status === 'streaming') tool.state.input = event.data.text;
          break;
        case 'session.tool.called':
          tool.state = { status: 'running', input: event.data.input, metadata: {} };
          tool.time.ran = event.created;
          break;
        case 'session.tool.progress':
          if (tool.state.status === 'running') tool.state.metadata = event.data.metadata;
          break;
        case 'session.tool.success':
          if (tool.state.status !== 'running') return undefined;
          tool.state = {
            status: 'completed',
            input: tool.state.input,
            content: event.data.content,
            metadata: event.data.metadata,
          };
          tool.time.completed = event.created;
          break;
        case 'session.tool.failed':
          if (tool.state.status === 'streaming') return undefined;
          tool.state = {
            status: 'error',
            input: tool.state.input,
            error: event.data.error,
            content: event.data.content,
            metadata: event.data.metadata,
          };
          tool.time.completed = event.created;
          break;
      }
      break;
    }
    default:
      return undefined;
  }
  return message.id;
}
