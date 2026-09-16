import { OpenCode } from '@opencode/client';

export type Connection = { url: string; password: string };

export function createClient(connection: Connection) {
  const url = new URL(connection.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP(S) server URL without embedded credentials.');
  }
  if (url.search || url.hash) throw new Error('The server URL cannot contain a query or fragment.');
  const bytes = new TextEncoder().encode(`opencode:${connection.password}`);
  return OpenCode.make({
    baseUrl: url.href.replace(/\/+$/, ''),
    headers: { Authorization: `Basic ${btoa(String.fromCharCode(...bytes))}` },
  });
}
