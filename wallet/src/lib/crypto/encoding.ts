/** Small, dependency-free encoding helpers (no secrets are ever logged here). */

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function utf8(str: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(str);
}

export function fromUtf8(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Best-effort overwrite of a buffer that held secret material. */
export function wipe(bytes: Uint8Array | undefined | null): void {
  if (bytes) bytes.fill(0);
}

export function randomId(): string {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}
