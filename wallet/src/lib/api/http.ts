export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** fetch JSON with timeout. Requests never carry credentials or secrets. */
export async function getJson<T>(url: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...init,
      signal: init.signal ?? ctrl.signal,
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
    if (!res.ok) {
      let detail = '';
      try {
        const body = await res.json();
        detail = body?.error || body?.message || '';
      } catch {
        /* ignore */
      }
      if (res.status === 429) throw new HttpError(429, 'Rate limited by data provider (429). Try again shortly.');
      throw new HttpError(res.status, detail ? `${detail} (${res.status})` : `Request failed (${res.status})`);
    }
    return (await res.json()) as T;
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error('Request timed out');
    throw e;
  } finally {
    clearTimeout(t);
  }
}
