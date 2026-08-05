export interface Row {
  metric_key: string;
  date: string; // YYYY-MM-DD
  value: number;
}

export interface Source {
  name: string;
  /** Returns daily rows. Throwing is fine; the collector isolates failures. */
  fetchDaily(env: Env): Promise<Row[]>;
}

/** fetch with a hard timeout, JSON-parsed. Every source goes through this. */
export async function fetchJson<T>(url: string, init?: RequestInit, timeoutMs = 10_000): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      accept: 'application/json',
      // some APIs (growthepie among them) 403 requests with no user agent
      'user-agent': 'ethereum-beat/0.1 (+https://github.com/ethereumbeat/ethereum-beat)',
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

/** Today in UTC as YYYY-MM-DD. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}
