/**
 * The tiny slice of protobuf wire encoding the Farcaster hub needs: varints
 * and length-delimited fields. Hand-rolled (no protobuf runtime dependency);
 * only the field shapes CastAdd uses are supported.
 */
const WIRE_VARINT = 0;
const WIRE_LEN = 2;

function varint(value: number | bigint): Uint8Array {
  let n = typeof value === 'bigint' ? value : BigInt(value);
  if (n < 0n) throw new Error('varint: negative');
  const out: number[] = [];
  do {
    let byte = Number(n & 0x7fn);
    n >>= 7n;
    if (n > 0n) byte |= 0x80;
    out.push(byte);
  } while (n > 0n);
  return new Uint8Array(out);
}

function tag(field: number, wire: number): Uint8Array {
  return varint((field << 3) | wire);
}

function concat(parts: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** Accumulates protobuf fields in declaration order. */
export class ProtoWriter {
  private parts: Uint8Array[] = [];

  /** varint field (enums, uint32/uint64) — 0 and default values are omitted */
  uint(field: number, value: number | bigint): this {
    if (value === 0 || value === 0n) return this;
    this.parts.push(tag(field, WIRE_VARINT), varint(value));
    return this;
  }

  /** length-delimited field: string, bytes, or an embedded message */
  bytes(field: number, value: Uint8Array): this {
    this.parts.push(tag(field, WIRE_LEN), varint(value.length), value);
    return this;
  }

  string(field: number, value: string): this {
    if (value.length === 0) return this;
    return this.bytes(field, new TextEncoder().encode(value));
  }

  message(field: number, value: Uint8Array): this {
    return this.bytes(field, value);
  }

  finish(): Uint8Array {
    return concat(this.parts);
  }
}
