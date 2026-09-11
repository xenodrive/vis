// Git's core.quotePath output is ASCII and preserves arbitrary filename bytes.
export function gitPath(encoded: string) {
  if (!encoded.startsWith('"')) return { file: encoded, pathBase64: btoa(encoded) };
  const bytes: number[] = [];
  const escapes: Record<string, number> = {
    a: 7,
    b: 8,
    t: 9,
    n: 10,
    v: 11,
    f: 12,
    r: 13,
    '"': 34,
    '\\': 92,
  };
  for (let i = 1; i < encoded.length - 1; i++) {
    if (encoded[i] !== '\\') {
      bytes.push(encoded.charCodeAt(i));
      continue;
    }
    const next = encoded[++i];
    if (/[0-7]/.test(next)) {
      bytes.push(parseInt(encoded.slice(i, i + 3), 8));
      i += 2;
    } else if (next in escapes) bytes.push(escapes[next]);
    else throw new Error('Invalid Git filename escape.');
  }
  let file: string;
  try {
    file = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    file = encoded;
  }
  return { file, pathBase64: btoa(bytes.map((byte) => String.fromCharCode(byte)).join('')) };
}
