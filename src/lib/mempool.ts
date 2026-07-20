/**
 * The mempool stream as a module singleton: with the ClientRouter the JS
 * context persists across channel switches, so one WSS connection serves
 * the whole session — no reconnect gap when returning to FLOW, and no
 * leaked sockets from remounting islands. Suspends while the tab hides.
 */

const WSS_ENDPOINTS = ['wss://ethereum-rpc.publicnode.com', 'wss://eth.drpc.org'];

export type StreamState = 'idle' | 'connecting' | 'live' | 'down';

type PendingListener = (hash: string, at: number) => void;
type StateListener = (state: StreamState) => void;

let ws: WebSocket | null = null;
let state: StreamState = 'idle';
let endpoint = 0;
let started = false;
let closedByUs = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

const pendingListeners = new Set<PendingListener>();
const stateListeners = new Set<StateListener>();
/** hashes seen this session (insertion-ordered, capped) so FLOW can mark inclusions */
const seenHashes = new Set<string>();
const SEEN_CAP = 4000;
let seenCount = 0;

function setState(s: StreamState): void {
  state = s;
  for (const cb of stateListeners) cb(s);
}

function connect(): void {
  if (document.hidden || (ws && ws.readyState <= WebSocket.OPEN)) return;
  setState('connecting');
  try {
    ws = new WebSocket(WSS_ENDPOINTS[endpoint % WSS_ENDPOINTS.length]!);
  } catch {
    setState('down');
    return;
  }
  let subId: string | null = null;
  ws.onopen = () =>
    ws?.send(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_subscribe', params: ['newPendingTransactions'] }));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data as string) as {
      id?: number;
      result?: string;
      method?: string;
      params?: { subscription: string; result: string };
    };
    if (d.id === 1 && d.result) {
      subId = d.result;
      setState('live');
    } else if (d.method === 'eth_subscription' && d.params?.subscription === subId) {
      const h = d.params.result;
      seenHashes.add(h);
      if (++seenCount > SEEN_CAP) {
        // trim oldest half when the cap is hit
        const keep = [...seenHashes].slice(-SEEN_CAP / 2);
        seenHashes.clear();
        for (const k of keep) seenHashes.add(k);
        seenCount = keep.length;
      }
      const at = Date.now();
      for (const cb of pendingListeners) cb(h, at);
    }
  };
  ws.onclose = () => {
    ws = null;
    if (closedByUs) return;
    setState('down');
    endpoint += 1;
    retryTimer = setTimeout(connect, 2500);
  };
  ws.onerror = () => ws?.close();
}

function onVisibility(): void {
  if (document.hidden) {
    closedByUs = true;
    clearTimeout(retryTimer);
    ws?.close();
    ws = null;
  } else if (started) {
    closedByUs = false;
    connect();
  }
}

/** idempotent: the first FLOW visit opens the stream; it then persists */
export function start(): void {
  if (started) return;
  started = true;
  closedByUs = false;
  document.addEventListener('visibilitychange', onVisibility);
  connect();
}

export function getState(): StreamState {
  return state;
}

export function wasSeen(hash: string): boolean {
  return seenHashes.has(hash);
}

export function onPending(cb: PendingListener): () => void {
  pendingListeners.add(cb);
  return () => pendingListeners.delete(cb);
}

export function onState(cb: StateListener): () => void {
  stateListeners.add(cb);
  cb(state);
  return () => stateListeners.delete(cb);
}
