/**
 * Minimal bech32 decode (BIP-173), just enough to turn a Nostr `nsec1…`
 * secret key into its 32 raw bytes. Hand-rolled to avoid a dependency for
 * ~40 lines; verified against a known nsec/npub vector in the broadcast test.
 */
const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i]!;
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) >>> 5);
  out.push(0);
  for (let i = 0; i < hrp.length; i++) out.push(hrp.charCodeAt(i) & 31);
  return out;
}

/** 5-bit groups → 8-bit bytes (no padding expected for a 32-byte payload) */
function convertBits(data: number[]): Uint8Array {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  for (const value of data) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      out.push((acc >>> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

/** Decode a bech32 string, asserting the HRP and a valid checksum. */
export function bech32ToBytes(input: string, expectedHrp: string): Uint8Array {
  const s = input.toLowerCase().trim();
  const sep = s.lastIndexOf('1');
  if (sep < 1) throw new Error('bech32: no separator');
  const hrp = s.slice(0, sep);
  if (hrp !== expectedHrp) throw new Error(`bech32: expected ${expectedHrp}, got ${hrp}`);
  const dataPart = s.slice(sep + 1);
  const values: number[] = [];
  for (const ch of dataPart) {
    const v = CHARSET.indexOf(ch);
    if (v === -1) throw new Error(`bech32: bad char ${ch}`);
    values.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...values]) !== 1) throw new Error('bech32: bad checksum');
  return convertBits(values.slice(0, -6)); // drop the 6-symbol checksum
}

/** Accept an nsec (bech32) or a raw 64-hex secret key; return 32 bytes. */
export function toSecretKeyBytes(key: string): Uint8Array {
  const k = key.trim();
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(k)) {
    const hex = k.replace(/^0x/, '');
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  const bytes = bech32ToBytes(k, 'nsec');
  if (bytes.length !== 32) throw new Error(`nsec decoded to ${bytes.length} bytes, expected 32`);
  return bytes;
}
