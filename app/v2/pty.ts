import type { OpenCodeClient, LocationRef } from '@opencode-ai/client';

export const PTY_FONT_FAMILY =
  "'Iosevka Term', 'Iosevka Fixed', 'JetBrains Mono', 'Cascadia Mono', 'SFMono-Regular', Menlo, Consolas, 'Liberation Mono', monospace";
export const PTY_LINGER_MS = 1000;

export function createPtyClient(client: OpenCodeClient, baseUrl: string, scope: LocationRef) {
  const location = { directory: scope.directory, workspace: scope.workspaceID };
  return {
    async list(signal: AbortSignal) {
      return (await client.pty.list({ location }, { signal })).data;
    },
    async create(signal: AbortSignal, command?: string) {
      return (
        await client.pty.create(
          {
            location,
            cwd: scope.directory,
            title: command ? 'vis git command' : 'vis terminal',
            ...(command
              ? {
                  command: '/bin/sh',
                  args: ['-c', 'IFS= read -r start; exec /bin/sh -c "$1"', 'vis-command', command],
                }
              : {}),
          },
          { signal },
        )
      ).data;
    },
    async resize(id: string, cols: number, rows: number, signal: AbortSignal) {
      await client.pty.update({ location, ptyID: id, size: { cols, rows } }, { signal });
    },
    async remove(id: string, signal: AbortSignal) {
      await client.pty.remove({ location, ptyID: id }, { signal });
    },
    async connectUrl(id: string, cursor: number | undefined, signal: AbortSignal) {
      const token = await client.pty.connect.token(
        { location, ptyID: id, 'x-opencode-ticket': '1' },
        { signal },
      );
      const url = new URL(
        `${baseUrl.replace(/\/$/, '')}/api/pty/${encodeURIComponent(id)}/connect`,
      );
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      url.searchParams.set('location[directory]', location.directory);
      if (location.workspace !== undefined)
        url.searchParams.set('location[workspace]', location.workspace);
      url.searchParams.set('ticket', token.data.ticket);
      if (cursor !== undefined) url.searchParams.set('cursor', String(cursor));
      return url.toString();
    },
  };
}
export type PtyClient = ReturnType<typeof createPtyClient>;

/** V2 counts JavaScript string units, and sends a NUL-prefixed cursor marker after replay. */
export class PtyCursor {
  value: number | undefined;
  private decoder = new TextDecoder('utf-8', { fatal: true });
  consume(frame: string | ArrayBuffer): string | undefined {
    if (frame instanceof ArrayBuffer) {
      const bytes = new Uint8Array(frame);
      if (bytes[0] === 0) {
        const meta = JSON.parse(this.decoder.decode(bytes.subarray(1)));
        if (!Number.isSafeInteger(meta.cursor) || meta.cursor < 0)
          throw new Error('Invalid PTY cursor');
        this.value = meta.cursor;
        return;
      }
      frame = this.decoder.decode(bytes);
    }
    if (this.value !== undefined) this.value += frame.length;
    return frame;
  }
}
