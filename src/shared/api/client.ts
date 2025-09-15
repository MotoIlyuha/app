import type { ApiError, ChannelDTO, SectionDTO, ThreadDTO } from './types';

const PREFERRED_BASES = [
  'https://api.lenzaos.com'
];

const API_BASE = (import.meta as any).env?.VITE_API_BASE || PREFERRED_BASES[0];

export interface RequestOptions {
  signal?: AbortSignal;
  retries?: number; // number of retries on network errors and 5xx
  timeoutMs?: number; // per-attempt timeout
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function toApiError(err: unknown, status?: number): ApiError {
  const e: ApiError = new Error(
    err instanceof Error ? err.message : 'Network request failed',
  );
  e.status = status;
  return e;
}

async function requestJson<T>(url: string, opts: RequestOptions = {}): Promise<T> {
  const { signal, retries = 3, timeoutMs = 15000 } = opts;

  let attempt = 0;
  // Support external cancellation
  const externalSignal = signal;

  while (true) {
    attempt++;
    const controller = new AbortController();

    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });

    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'accept': 'application/json' } });
      clearTimeout(t);
      externalSignal?.removeEventListener('abort', onAbort);

      if (!res.ok) {
        // Retry only on 5xx
        if (res.status >= 500 && attempt <= retries) {
          const backoff = Math.min(800 * 2 ** (attempt - 1), 4000);
          await sleep(backoff + Math.random() * 200);
          continue;
        }
        const text = await res.text().catch(() => '');
        throw toApiError(new Error(text || `HTTP ${res.status}`), res.status);
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(t);
      externalSignal?.removeEventListener('abort', onAbort);
      // Abort: rethrow immediately
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      // Network error
      if (attempt <= retries) {
        const backoff = Math.min(400 * 2 ** (attempt - 1), 3000);
        await sleep(backoff + Math.random() * 150);
        continue;
      }
      throw toApiError(err);
    }
  }
}

export function buildUrl(path: string): string {
  const base = API_BASE;
  return `${base}${path}`;
}

function normalizeList<T>(resp: any, label: string): T[] {
  if (Array.isArray(resp)) return resp as T[];
  if (resp && typeof resp === 'object') {
    const candidates = ['data', 'items', 'rows', 'list', 'result', 'results', label];
    for (const key of candidates) {
      const val = (resp as any)[key];
      if (Array.isArray(val)) return val as T[];
    }
  }
  console.warn(`Expected array for ${label} but received`, resp);
  return [] as T[];
}

export function getSections(options?: RequestOptions) {
  return requestJson<any>(buildUrl('/section?v=0.0'), options).then((r) => normalizeList<SectionDTO>(r, 'sections'));
}

export function getChannels(options?: RequestOptions) {
  return requestJson<any>(buildUrl('/chat?v=0.0'), options).then((r) => normalizeList<ChannelDTO>(r, 'channels'));
}

export function getThreads(options?: RequestOptions) {
  return requestJson<any>(buildUrl('/thread?v=0.0'), options).then((r) => normalizeList<ThreadDTO>(r, 'threads'));
}

export function createAbortController() {
  return new AbortController();
}


