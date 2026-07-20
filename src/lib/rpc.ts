/**
 * Tier 2 liveness: one eth_getBlockByNumber per slot against public RPCs.
 * Ordered fallback list, verified 2026-07-18 (cloudflare-eth and llamarpc
 * were broken and are deliberately absent). If everything fails the Tier 2
 * tickers hide; Tier 1 keeps the page alive forever.
 */

const RPC_ENDPOINTS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.drpc.org',
  'https://1rpc.io/eth',
];

export interface BlockStats {
  number: number;
  hash: string;
  baseFeeGwei: number;
  gasUsed: number;
  gasLimit: number;
  txCount: number;
  blobCount: number;
  burnedEth: number;
}

let preferred = 0;

function parseBlock(b: Record<string, unknown>): BlockStats {
  const baseFee = BigInt((b['baseFeePerGas'] as string) ?? '0x0');
  const gasUsed = Number(BigInt(b['gasUsed'] as string));
  const blobGasUsed = b['blobGasUsed'] ? Number(BigInt(b['blobGasUsed'] as string)) : 0;
  return {
    number: Number(BigInt(b['number'] as string)),
    hash: b['hash'] as string,
    baseFeeGwei: Number(baseFee) / 1e9,
    gasUsed,
    gasLimit: Number(BigInt(b['gasLimit'] as string)),
    txCount: Array.isArray(b['transactions']) ? b['transactions'].length : 0,
    blobCount: Math.round(blobGasUsed / 131_072),
    burnedEth: (Number(baseFee) * gasUsed) / 1e18,
  };
}

/** one numbered block; used by the session-buffer backfill */
export async function fetchBlockByNumber(n: number): Promise<BlockStats | null> {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const idx = (preferred + i) % RPC_ENDPOINTS.length;
    try {
      const res = await fetch(RPC_ENDPOINTS[idx]!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: n,
          method: 'eth_getBlockByNumber',
          params: [`0x${n.toString(16)}`, false],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: Record<string, unknown> };
      if (!json.result?.['number']) throw new Error('empty result');
      preferred = idx;
      return parseBlock(json.result);
    } catch {
      // next endpoint
    }
  }
  return null;
}

export interface TxSummary {
  hash: string;
  /** TRANSFER | CONTRACT | BLOB, classified from type + calldata */
  cls: 'TRANSFER' | 'CONTRACT' | 'BLOB';
  valueEth: number;
}

export interface BlockFull extends BlockStats {
  txs: TxSummary[];
}

/** latest block WITH transactions, classified — used by FLOW at seal time */
export async function fetchLatestBlockFull(): Promise<BlockFull | null> {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const idx = (preferred + i) % RPC_ENDPOINTS.length;
    try {
      const res = await fetch(RPC_ENDPOINTS[idx]!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest', true],
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: Record<string, unknown> };
      if (!json.result?.['number']) throw new Error('empty result');
      preferred = idx;
      const base = parseBlock(json.result);
      const raw = (json.result['transactions'] as Record<string, unknown>[]) ?? [];
      const txs: TxSummary[] = raw.map((t) => {
        const type = (t['type'] as string) ?? '0x0';
        const input = (t['input'] as string) ?? '0x';
        const cls: TxSummary['cls'] =
          type === '0x3' ? 'BLOB' : t['to'] === null || input.length > 2 ? 'CONTRACT' : 'TRANSFER';
        return {
          hash: t['hash'] as string,
          cls,
          valueEth: Number(BigInt((t['value'] as string) ?? '0x0') / 1_000_000_000_000n) / 1e6,
        };
      });
      return { ...base, txCount: raw.length, txs };
    } catch {
      // next endpoint
    }
  }
  return null;
}

/** current blob base fee in gwei (EIP-4844 market price) */
export async function fetchBlobBaseFee(): Promise<number | null> {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const idx = (preferred + i) % RPC_ENDPOINTS.length;
    try {
      const res = await fetch(RPC_ENDPOINTS[idx]!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blobBaseFee', params: [] }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: string };
      if (!json.result) throw new Error('empty');
      return Number(BigInt(json.result)) / 1e9;
    } catch {
      // next endpoint
    }
  }
  return null;
}

export async function fetchLatestBlock(): Promise<BlockStats | null> {
  for (let i = 0; i < RPC_ENDPOINTS.length; i++) {
    const idx = (preferred + i) % RPC_ENDPOINTS.length;
    try {
      const res = await fetch(RPC_ENDPOINTS[idx]!, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest', false],
        }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { result?: Record<string, unknown> };
      if (!json.result?.['number']) throw new Error('empty result');
      preferred = idx; // remember what worked
      return parseBlock(json.result);
    } catch {
      // try the next endpoint
    }
  }
  return null;
}
