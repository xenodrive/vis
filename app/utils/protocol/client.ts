import { OpenCode } from '@opencode/client';

export type Connection = { url: string; token: string };

export async function redeemPairingLink(value: string, signal: AbortSignal): Promise<Connection> {
  const url = new URL(value.trim());
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/auth\/connect\/[A-Za-z0-9_-]+$/.test(url.pathname)
  ) {
    throw new Error('Enter the full HTTP(S) pairing URL from opencode pair.');
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' }, signal });
  if (response.status === 401) {
    throw new Error(
      'This pairing link expired or was already used. Run opencode pair to get a new one.',
    );
  }
  if (!response.ok) throw new Error(`Pairing failed (HTTP ${response.status}).`);
  const session: unknown = await response.json();
  if (
    !session ||
    typeof session !== 'object' ||
    !('token' in session) ||
    typeof session.token !== 'string' ||
    !session.token
  ) {
    throw new Error('The server returned an invalid pairing session.');
  }
  return { url: url.origin, token: session.token };
}

export function createClient(connection: Connection) {
  const url = new URL(connection.url);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Use an HTTP(S) server URL without embedded credentials.');
  }
  if (url.search || url.hash) throw new Error('The server URL cannot contain a query or fragment.');
  const bytes = new TextEncoder().encode(`opencode:${connection.token}`);
  return OpenCode.make({
    baseUrl: url.href.replace(/\/+$/, ''),
    headers: { Authorization: `Basic ${btoa(String.fromCharCode(...bytes))}` },
  });
}
