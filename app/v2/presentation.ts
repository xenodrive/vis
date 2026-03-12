import type {
  SessionInfo,
  SessionMessageInfo,
  SessionMessageAssistantTool,
} from '@opencode-ai/client';
import type { MessageInfo, MessagePart, ToolPart } from '../types/sse';

export type PresentedMessage = { info: MessageInfo; parts: MessagePart[] };

/** The existing visual components consume these display records, never V1 HTTP/SSE packets. */
export function presentTool(
  sessionID: string,
  messageID: string,
  tool: SessionMessageAssistantTool,
): ToolPart {
  const base = {
    id: `${messageID}:tool:${tool.id}`,
    sessionID,
    messageID,
    type: 'tool' as const,
    callID: tool.id,
    tool: tool.name,
    v2: tool,
  };
  const state = tool.state;
  switch (state.status) {
    case 'streaming':
      return { ...base, state: { status: 'pending', input: {}, raw: state.input } };
    case 'running':
      return {
        ...base,
        state: {
          status: 'running',
          input: state.input,
          metadata: state.metadata,
          time: { start: tool.time.ran ?? tool.time.created },
        },
      };
    case 'completed':
      return {
        ...base,
        state: {
          status: 'completed',
          input: state.input,
          output: state.content
            .map((content) =>
              content.type === 'text' ? content.text : JSON.stringify(content, null, 2),
            )
            .join('\n'),
          title: tool.name,
          metadata: state.metadata ?? {},
          time: {
            start: tool.time.ran ?? tool.time.created,
            end: tool.time.completed ?? tool.time.created,
          },
        },
      };
    case 'error':
      return {
        ...base,
        state: {
          status: 'error',
          input: state.input,
          error: state.error.message,
          metadata: state.metadata,
          time: {
            start: tool.time.ran ?? tool.time.created,
            end: tool.time.completed ?? tool.time.created,
          },
        },
      };
  }
}

export function presentTranscript(
  session: Pick<SessionInfo, 'id' | 'location'>,
  transcript: SessionMessageInfo[],
): PresentedMessage[] {
  let rootID: string | undefined;
  const result: PresentedMessage[] = [];
  for (const message of transcript) {
    if (!['user', 'assistant'].includes(message.type)) continue;
    const base = { sessionID: session.id, messageID: message.id };
    if (message.type === 'assistant') {
      result.push({
        info: {
          id: message.id,
          sessionID: session.id,
          role: 'assistant',
          parentID: rootID,
          time: message.time,
          agent: message.agent,
          mode: message.agent,
          modelID: message.model.id,
          providerID: message.model.providerID,
          variant: message.model.variant,
          tokens: message.tokens,
          cost: message.cost,
          finish: message.finish,
          path: { cwd: session.location.directory, root: session.location.directory },
          error: message.error
            ? { name: message.error.type, data: { message: message.error.message } }
            : undefined,
        },
        parts: message.content.map((content, index): MessagePart => {
          if (content.type === 'tool') return presentTool(session.id, message.id, content);
          if (content.type === 'reasoning')
            return {
              ...base,
              id: `${message.id}:reasoning:${index}`,
              type: 'reasoning',
              text: content.text,
              time: {
                start: content.time?.created ?? message.time.created,
                end: content.time?.completed,
              },
            };
          return { ...base, id: `${message.id}:text:${index}`, type: 'text', text: content.text };
        }),
      });
      continue;
    }
    let text: string;
    switch (message.type) {
      case 'user':
      case 'synthetic':
      case 'system':
      case 'skill':
        text = message.text;
        break;
      case 'agent-switched':
        text = `Agent → ${message.agent}`;
        break;
      case 'model-switched':
        text = `Model → ${message.model.providerID}/${message.model.id}${message.model.variant ? ` #${message.model.variant}` : ''}`;
        break;
      case 'location-switched':
        text = `Directory → ${message.location.directory}`;
        break;
      case 'compaction':
        text = message.status === 'failed' ? message.error.message : message.summary;
        break;
      case 'shell':
        text = `$ ${message.command}\n${message.output?.output ?? ''}`;
        break;
    }
    const parts: MessagePart[] = [
      { ...base, id: `${message.id}:text`, type: 'text', text, synthetic: message.type !== 'user' },
    ];
    if (message.type === 'user') {
      rootID = message.id;
      for (const [index, file] of (message.files ?? []).entries()) {
        parts.push({
          ...base,
          id: `${message.id}:file:${index}`,
          type: 'file',
          mime: file.mime,
          filename: file.name,
          url: `data:${file.mime};base64,${file.data}`,
        });
      }
    }
    result.push({
      info: { id: message.id, sessionID: session.id, role: 'user', time: message.time },
      parts,
    });
  }
  return result;
}
