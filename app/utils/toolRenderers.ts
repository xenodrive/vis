export function extractXmlTagContent(text: string, tag: string): string | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const start = text.indexOf(open);
  const end = text.indexOf(close);
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start + open.length, end).trim();
}

export type ToolRenderersHelpers = {
  FILE_READ_EVENT_TYPES: Set<string>;
  FILE_WRITE_EVENT_TYPES: Set<string>;
  MESSAGE_EVENT_TYPES: Set<string>;
  parsePatchTextBlocks: (patchText: string) => Array<{ path: string; content: string }>;
  guessLanguage: (path?: string, eventType?: string) => string;
  shouldRenderToolWindow: (tool: string) => boolean;
  extractToolOutputText: (output: unknown) => string | undefined;
  formatToolValue: (value: unknown) => string;
  renderWorkerHtml: (args: Record<string, unknown>) => Promise<string>;
  renderReadHtmlFromApi: (args: Record<string, unknown>) => Promise<string>;
  resolveReadWritePath: (
    input?: Record<string, unknown>,
    metadata?: Record<string, unknown>,
    state?: Record<string, unknown>,
  ) => string;
  guessLanguageFromPath: (path?: string) => string;
  resolveReadRange: (input?: Record<string, unknown>) => { offset?: number; limit?: number };
  renderEditDiffHtml: (args: {
    diff: string;
    code?: string;
    after?: string;
    lang: string;
  }) => (() => Promise<string>) | string;
  formatGlobToolTitle: (input?: Record<string, unknown>) => string;
  formatListToolTitle: (input?: Record<string, unknown>) => string;
  formatWebfetchToolTitle: (input?: Record<string, unknown>) => string;
  formatQueryToolTitle: (input?: Record<string, unknown>) => string;
  formatTaskToolOutput: (value: string) => string;
  DefaultContent: unknown;
};

export function extractStepFinish(
  payload: unknown,
  eventType: string,
  helpers: Pick<ToolRenderersHelpers, 'MESSAGE_EVENT_TYPES'>,
) {
  if (!payload || typeof payload !== 'object') return null;
  if (!helpers.MESSAGE_EVENT_TYPES.has(eventType)) return null;
  const record = payload as Record<string, unknown>;
  const nestedPayload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const properties =
    (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
      ? (nestedPayload.properties as Record<string, unknown>)
      : undefined) ??
    (record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : undefined);
  const part =
    properties?.part && typeof properties.part === 'object'
      ? (properties.part as Record<string, unknown>)
      : undefined;
  const partType = typeof part?.type === 'string' ? part.type : undefined;
  if (partType !== 'step-finish') return null;
  const reason = typeof part?.reason === 'string' ? (part.reason as string) : undefined;
  const sessionId = typeof part?.sessionID === 'string' ? (part.sessionID as string) : undefined;
  const messageId = typeof part?.messageID === 'string' ? (part.messageID as string) : undefined;
  return { reason, sessionId, messageId };
}

export function extractPatch(
  payload: unknown,
  helpers: Pick<ToolRenderersHelpers, 'parsePatchTextBlocks' | 'guessLanguage'>,
) {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  const nestedPayload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const properties =
    (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
      ? (nestedPayload.properties as Record<string, unknown>)
      : undefined) ??
    (record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : undefined);
  const data =
    (record.data as Record<string, unknown> | undefined) ??
    nestedPayload ??
    (record.result as Record<string, unknown> | undefined);
  const messageObject =
    (properties?.message as Record<string, unknown> | undefined) ??
    (data?.message as Record<string, unknown> | undefined) ??
    (record.message as Record<string, unknown> | undefined);
  const part =
    (properties?.part && typeof properties.part === 'object'
      ? (properties.part as Record<string, unknown>)
      : undefined) ??
    (data?.part && typeof data.part === 'object'
      ? (data.part as Record<string, unknown>)
      : undefined) ??
    (record.part && typeof record.part === 'object'
      ? (record.part as Record<string, unknown>)
      : undefined) ??
    (messageObject?.part && typeof messageObject.part === 'object'
      ? (messageObject.part as Record<string, unknown>)
      : undefined);

  if (part?.type !== 'tool' || part?.tool !== 'apply_patch') return null;

  const callId =
    (part?.callID as string | undefined) ??
    (part?.callId as string | undefined) ??
    (properties?.callID as string | undefined) ??
    (properties?.callId as string | undefined);
  const state =
    part?.state && typeof part.state === 'object'
      ? (part.state as Record<string, unknown>)
      : undefined;
  const status = typeof state?.status === 'string' ? state.status : undefined;
  if (!status || status === 'pending' || status === 'running') return null;

  const input =
    state?.input && typeof state.input === 'object'
      ? (state.input as Record<string, unknown>)
      : undefined;
  const metadata =
    state?.metadata && typeof state.metadata === 'object'
      ? (state.metadata as Record<string, unknown>)
      : undefined;

  const patchText = typeof input?.patchText === 'string' ? input.patchText : '';
  const parsedBlocks = patchText ? helpers.parsePatchTextBlocks(patchText) : [];
  if (parsedBlocks.length === 0) return null;

  const metadataFilesRaw = Array.isArray(metadata?.files) ? metadata.files : [];
  const metadataFileRecords = metadataFilesRaw.map((item) => {
    if (!item || typeof item !== 'object') return null;
    const record = item as Record<string, unknown>;
    const relativePath =
      (typeof record.relativePath === 'string' && record.relativePath) ||
      (typeof record.filePath === 'string' && record.filePath) ||
      (typeof record.file === 'string' && record.file) ||
      undefined;
    const diff = typeof record.diff === 'string' ? record.diff : undefined;
    const before = typeof record.before === 'string' ? record.before : undefined;
    const after = typeof record.after === 'string' ? record.after : undefined;
    return { relativePath, diff, before, after, record };
  });

  const baseCallId = callId ?? 'apply_patch';
  const entries = parsedBlocks.map((block, index) => {
    const mf = metadataFileRecords[index];
    return {
      content: block.content,
      path: block.path,
      code: mf?.before,
      after: mf?.after,
      isWrite: true,
      callId: `${baseCallId}:${index}`,
      toolStatus: status,
      toolName: 'apply_patch',
      toolTitle: block.path,
      lang: helpers.guessLanguage(block.path),
      view: 'diff' as const,
    };
  });
  return entries;
}

export function extractFileRead(
  payload: unknown,
  eventType: string,
  helpers: Omit<ToolRenderersHelpers, 'MESSAGE_EVENT_TYPES' | 'parsePatchTextBlocks' | 'guessLanguage'>,
) {
  if (typeof payload === 'string') {
    if (helpers.FILE_READ_EVENT_TYPES.has(eventType) || helpers.FILE_WRITE_EVENT_TYPES.has(eventType)) {
      return {
        content: payload,
        path: undefined,
        isWrite: helpers.FILE_WRITE_EVENT_TYPES.has(eventType),
      };
    }
    return null;
  }

  if (!payload || typeof payload !== 'object') return null;

  const record = payload as Record<string, unknown>;
  const nestedPayload =
    record.payload && typeof record.payload === 'object'
      ? (record.payload as Record<string, unknown>)
      : undefined;
  const properties =
    (nestedPayload?.properties && typeof nestedPayload.properties === 'object'
      ? (nestedPayload.properties as Record<string, unknown>)
      : undefined) ??
    (record.properties && typeof record.properties === 'object'
      ? (record.properties as Record<string, unknown>)
      : undefined);
  const part =
    properties?.part && typeof properties.part === 'object'
      ? (properties.part as Record<string, unknown>)
      : undefined;
  const tool = part?.tool;
  if (part?.type === 'tool' && typeof tool === 'string') {
    if (!helpers.shouldRenderToolWindow(tool) || tool === 'apply_patch') return null;
    const state =
      part?.state && typeof part.state === 'object'
        ? (part.state as Record<string, unknown>)
        : undefined;
    const status = typeof state?.status === 'string' ? state.status : undefined;
    if (!status || status === 'pending') return null;
    const input =
      state?.input && typeof state.input === 'object'
        ? (state.input as Record<string, unknown>)
        : undefined;
    const metadata =
      state?.metadata && typeof state.metadata === 'object'
        ? (state.metadata as Record<string, unknown>)
        : undefined;
    const output = state?.output ?? (state?.metadata as Record<string, unknown> | undefined)?.output;
    const callId =
      (part?.callID as string | undefined) ??
      (part?.callId as string | undefined) ??
      (properties?.callID as string | undefined) ??
      (properties?.callId as string | undefined);
    const outputText = output !== undefined ? helpers.extractToolOutputText(output) : undefined;
    const stateError = state?.error;
    const errorText =
      typeof stateError === 'string'
        ? stateError
        : stateError !== undefined
          ? helpers.formatToolValue(stateError)
          : undefined;

    const toolPrefix = (label: string, detail?: string) => {
      const d = detail?.trim();
      return d ? `[${label}] ${d}` : `[${label}]`;
    };

    switch (tool) {
      case 'bash': {
        const command = typeof input?.command === 'string' ? input.command.trim() : '';
        const titleDetail = command ? command.split('\n')[0].slice(0, 80) : undefined;
        const bashOutput = outputText ?? errorText ?? '';
        const bashLines: string[] = [];
        if (command) bashLines.push(`$ ${command}`);
        if (bashOutput.trim()) {
          if (bashLines.length > 0) bashLines.push('');
          bashLines.push(bashOutput);
        }
        const bashCode =
          bashLines.length === 0 && status === 'running' ? '$' : bashLines.join('\n');
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `bash-${callId ?? Date.now().toString(36)}`,
              code: bashCode,
              lang: 'shellscript',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
          variant: 'term' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('SHELL', titleDetail),
        };
      }
      case 'read': {
        if (status === 'running') return null;
        const readPath = helpers.resolveReadWritePath(input, metadata, state);
        if (outputText && outputText.includes('<type>directory</type>')) {
          const entriesContent = extractXmlTagContent(outputText, 'entries') ?? outputText;
          return {
            content: () =>
              helpers.renderWorkerHtml({
                id: `read-dir-${callId ?? Date.now().toString(36)}`,
                code: entriesContent,
                lang: 'text',
                theme: 'github-dark',
                gutterMode: 'none',
              }),
            variant: 'term' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('READ', readPath),
          };
        }
        const readLang = helpers.guessLanguageFromPath(readPath);
        const readRange = helpers.resolveReadRange(input);
        return {
          content: () =>
            helpers.renderReadHtmlFromApi({
              callId,
              path: readPath,
              lang: readLang,
              lineOffset: readRange.offset,
              lineLimit: readRange.limit,
              fallbackText: outputText,
            }),
          variant: 'code' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('READ', readPath),
        };
      }
      case 'grep': {
        if (status === 'running') return null;
        const grepCode = outputText ?? errorText ?? '';
        const grepLineRe = /^\s*Line\s+(\d+):\s?/;
        const gutterLines = grepCode.split('\n').map((line) => {
          const match = line.match(grepLineRe);
          return match?.[1] ?? '';
        });
        const grepPattern = typeof input?.pattern === 'string' ? input.pattern : undefined;
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `grep-${callId ?? Date.now().toString(36)}`,
              code: grepCode
                .split('\n')
                .map((line) => line.replace(grepLineRe, ''))
                .join('\n'),
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
              gutterLines,
              grepPattern,
            }),
          variant: 'code' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('GREP', helpers.formatGlobToolTitle(input)),
        };
      }
      case 'glob': {
        if (status === 'running') return null;
        const globCode = outputText ?? errorText ?? '';
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `glob-${callId ?? Date.now().toString(36)}`,
              code: globCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
          variant: 'term' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('GLOB', helpers.formatGlobToolTitle(input)),
        };
      }
      case 'list': {
        const listCode = outputText ?? errorText ?? '';
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `list-${callId ?? Date.now().toString(36)}`,
              code: listCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
            }),
          variant: 'code' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('LS', helpers.formatListToolTitle(input)),
        };
      }
      case 'webfetch': {
        if (status === 'running') return null;
        const webfetchCode = outputText ?? errorText ?? '';
        const format = typeof input?.format === 'string' ? input.format.toLowerCase() : '';
        const webfetchLang =
          format === 'html' ? 'html' : format === 'markdown' ? 'markdown' : 'text';
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `webfetch-${callId ?? Date.now().toString(36)}`,
              code: webfetchCode,
              lang: webfetchLang,
              theme: 'github-dark',
              gutterMode: 'none',
            }),
          variant: 'plain' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('FETCH', helpers.formatWebfetchToolTitle(input)),
        };
      }
      case 'websearch':
      case 'codesearch': {
        if (status === 'running') return null;
        const searchPrefix = tool === 'websearch' ? 'SEARCH' : 'CODE';
        const searchCode = outputText ?? errorText ?? '';
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `${tool}-${callId ?? Date.now().toString(36)}`,
              code: searchCode,
              lang: 'markdown',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
          variant: 'plain' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix(searchPrefix, helpers.formatQueryToolTitle(input)),
        };
      }
      case 'task': {
        const taskDescription = typeof input?.description === 'string' ? input.description.trim() : '';
        const taskPrompt = typeof input?.prompt === 'string' ? input.prompt.trim() : '';
        const taskTitle =
          taskDescription || (taskPrompt ? taskPrompt.split('\n')[0].slice(0, 80) : '');
        const taskOutput = helpers.formatTaskToolOutput(outputText ?? errorText ?? '');
        const taskCode = taskPrompt
          ? `## Input\n\n${taskPrompt}\n\n---\n\n## Output\n\n${taskOutput}`
          : taskOutput;
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `task-${callId ?? Date.now().toString(36)}`,
              code: taskCode,
              lang: 'markdown',
              theme: 'github-dark',
              gutterMode: 'none',
            }),
          variant: 'term' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('TASK', taskTitle),
        };
      }
      case 'batch': {
        const batchCode = outputText ?? errorText ?? '';
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `batch-${callId ?? Date.now().toString(36)}`,
              code: batchCode,
              lang: 'text',
              theme: 'github-dark',
              gutterMode: 'single',
            }),
          variant: 'code' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('BATCH'),
        };
      }
      case 'write': {
        const writePath = helpers.resolveReadWritePath(input, metadata, state);
        const writeContent = typeof input?.content === 'string' ? input.content : '';
        const writeCode = writeContent || outputText || errorText || '';
        const inputFilePath = typeof input?.filePath === 'string' ? input.filePath : writePath;
        const writeLang = helpers.guessLanguageFromPath(inputFilePath);
        return {
          content: () =>
            helpers.renderWorkerHtml({
              id: `write-${callId ?? Date.now().toString(36)}`,
              code: writeCode,
              lang: writeLang,
              theme: 'github-dark',
              gutterMode: 'single',
            }),
          variant: 'code' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('WRITE', writePath),
        };
      }
      case 'edit': {
        if (status === 'running') return null;
        const diff = typeof metadata?.diff === 'string' ? metadata.diff : '';
        if (!diff) return null;
        const editPath = helpers.resolveReadWritePath(input, metadata, state);
        const filediff =
          metadata?.filediff && typeof metadata.filediff === 'object'
            ? (metadata.filediff as Record<string, unknown>)
            : undefined;
        const editCode = typeof filediff?.before === 'string' ? filediff.before : undefined;
        const editAfter = typeof filediff?.after === 'string' ? filediff.after : undefined;
        const editLang = helpers.guessLanguageFromPath(editPath);
        return {
          content: helpers.renderEditDiffHtml({
            diff,
            code: editCode,
            after: editAfter,
            lang: editLang,
          }),
          variant: 'diff' as const,
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix('EDIT', editPath),
        };
      }
      case 'multiedit': {
        if (status === 'running') return null;
        const editPathMulti = helpers.resolveReadWritePath(input, metadata, state);
        const multiLang = helpers.guessLanguageFromPath(editPathMulti);
        const results = Array.isArray(metadata?.results) ? metadata.results : [];
        const editEntries = results
          .map((item) => {
            if (!item || typeof item !== 'object') return null;
            const r = item as Record<string, unknown>;
            const diff = r.diff;
            if (typeof diff !== 'string' || !diff.trim()) return null;
            const fd =
              r.filediff && typeof r.filediff === 'object'
                ? (r.filediff as Record<string, unknown>)
                : undefined;
            return {
              diff,
              code: typeof fd?.before === 'string' ? fd.before : undefined,
              after: typeof fd?.after === 'string' ? fd.after : undefined,
            };
          })
          .filter(
            (
              item,
            ): item is { diff: string; code: string | undefined; after: string | undefined } =>
              Boolean(item),
          );
        if (editEntries.length > 1) {
          return editEntries.map((entry, index) => ({
            content: helpers.renderEditDiffHtml({
              diff: entry.diff,
              code: entry.code,
              after: entry.after,
              lang: multiLang,
            }),
            variant: 'diff' as const,
            callId: callId ? `${callId}:${index}` : undefined,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix(
              'EDIT',
              editPathMulti
                ? `${editPathMulti} (${index + 1}/${editEntries.length})`
                : `(${index + 1}/${editEntries.length})`,
            ),
          }));
        }
        if (editEntries.length === 1) {
          return {
            content: helpers.renderEditDiffHtml({
              diff: editEntries[0].diff,
              code: editEntries[0].code,
              after: editEntries[0].after,
              lang: multiLang,
            }),
            variant: 'diff' as const,
            callId,
            toolName: tool,
            toolStatus: status,
            title: toolPrefix('EDIT', editPathMulti),
          };
        }
        return null;
      }
      case 'plan_enter':
      case 'plan_exit': {
        return {
          component: helpers.DefaultContent,
          props: { input, output: outputText, error: errorText, status, state, toolName: tool },
          callId,
          toolName: tool,
          toolStatus: status,
          title: toolPrefix(tool === 'plan_enter' ? 'PLAN' : 'PLAN EXIT'),
        };
      }
      default:
        return null;
    }
  }
  const type =
    record.type ??
    record.event ??
    record.name ??
    record.command ??
    nestedPayload?.type ??
    eventType;

  if (
    typeof type === 'string' &&
    (helpers.FILE_READ_EVENT_TYPES.has(type) || helpers.FILE_WRITE_EVENT_TYPES.has(type))
  ) {
    const isWrite = helpers.FILE_WRITE_EVENT_TYPES.has(type);
    if (isWrite) return null;
    const isDiffEvent = type.startsWith('session.diff');
    if (isDiffEvent) return null;
    const data =
      (record.data as Record<string, unknown> | undefined) ??
      (record.payload as Record<string, unknown> | undefined) ??
      (record.result as Record<string, unknown> | undefined) ??
      (record.file as Record<string, unknown> | undefined) ??
      (record.params as Record<string, unknown> | undefined) ??
      (record.arguments as Record<string, unknown> | undefined);
    const content =
      (data?.content as string | undefined) ??
      (data?.text as string | undefined) ??
      (data?.body as string | undefined) ??
      (data?.fileContent as string | undefined) ??
      ((data?.file as Record<string, unknown> | undefined)?.content as string | undefined) ??
      (isDiffEvent
        ? ((data?.diff as string | undefined) ?? (data?.patch as string | undefined))
        : undefined);
    const path =
      (data?.path as string | undefined) ??
      (data?.filePath as string | undefined) ??
      (data?.name as string | undefined) ??
      ((data?.file as Record<string, unknown> | undefined)?.path as string | undefined);

    if (typeof content === 'string') {
      return { content, path, isWrite };
    }
  }

  return null;
}
