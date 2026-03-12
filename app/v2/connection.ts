import { OpenCode } from '@opencode-ai/client';

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

export function errorMessage(error: unknown): string {
  if (
    error instanceof Error &&
    'reason' in error &&
    error.reason === 'UnexpectedStatus' &&
    typeof error.cause === 'object' &&
    error.cause !== null &&
    'status' in error.cause &&
    typeof error.cause.status === 'number'
  ) {
    return `${error.message} (HTTP ${error.cause.status})`;
  }
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return String(error);
}
