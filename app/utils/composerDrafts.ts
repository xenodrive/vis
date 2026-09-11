export type ComposerDraft = {
  messageInput: string;
  rev?: number;
  writerTabId?: string;
  updatedAt?: number;
  [key: string]: unknown;
};

export function createDraftStore(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  writerTabId: string,
) {
  function read(): Record<string, ComposerDraft> {
    const raw = storage.getItem(key);
    if (raw === null) return {};
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid composer draft storage');
    for (const draft of Object.values(value)) {
      if (!draft || typeof draft !== 'object' || typeof draft.messageInput !== 'string') {
        throw new Error('Invalid composer draft record');
      }
    }
    return value as Record<string, ComposerDraft>;
  }
  function get(id: string) {
    return read()[id];
  }
  function write(id: string, changes: Pick<ComposerDraft, 'messageInput'>) {
    const store = read();
    const previous = store[id];
    store[id] = {
      ...previous,
      ...changes,
      rev: (typeof previous?.rev === 'number' ? previous.rev : 0) + 1,
      writerTabId,
      updatedAt: Date.now(),
    };
    storage.setItem(key, JSON.stringify(store));
    return store[id];
  }
  function clearSent(id: string, sent: ComposerDraft) {
    const current = get(id);
    if (JSON.stringify(current) !== JSON.stringify(sent)) return false;
    write(id, { messageInput: '' });
    return true;
  }
  return { get, write, clearSent };
}
