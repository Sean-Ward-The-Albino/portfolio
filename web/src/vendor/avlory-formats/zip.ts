// @ts-nocheck
// Copied from Avlory's avlory/packages/avlory_formats_js/src/zip.ts (v1.2.0, Apache-2.0) by scripts/sync-avlory.mjs. Don't edit.
// A small ZIP reader and writer for Avlory packages: the central directory is read by hand, parts are inflated with
// the platform's DecompressionStream ('deflate-raw') through a counter that stops at its cap, whatever the headers
// say, so a zip bomb or a part that lies about its size can't use up memory.
import { AvloryFileError } from './errors.js';

export interface ZipLimits {
  maxEntries: number;
  maxEntryBytes: number;
  maxTotalBytes: number;
  /** How many times bigger than the file what's read may be, once more than ratioFloor has been unpacked. */
  maxRatio: number;
  ratioFloor: number;
}

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localOffset: number;
}

const tooBig = () => new AvloryFileError('damaged', 'This file unpacks to more than can be opened safely.');
const notZip = () => new AvloryFileError('notPackage', "This isn't an Avlory file, or it's damaged.");

function u16(b: Uint8Array, i: number): number {
  if (i + 2 > b.length) throw notZip();
  return b[i] | (b[i + 1] << 8);
}
function u32(b: Uint8Array, i: number): number {
  return (u16(b, i) + u16(b, i + 2) * 0x10000) >>> 0;
}

/** The parts a ZIP file's end record says it has (ZIP64 too), or null when there's no end record. */
export function zipEntryCount(b: Uint8Array): number | null {
  const stop = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= stop; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      const count = u16(b, i + 10);
      if (count !== 0xffff) return count;
      const loc = i - 20;
      if (loc < 0 || u32(b, loc) !== 0x07064b50) return count;
      const at = u32(b, loc + 8) + u32(b, loc + 12) * 0x100000000;
      if (at < 0 || at + 40 > b.length || u32(b, at) !== 0x06064b50) return null;
      return u32(b, at + 32) + u32(b, at + 36) * 0x100000000;
    }
  }
  return null;
}

export class SafeZip {
  private constructor(
    private readonly bytes: Uint8Array,
    readonly entries: Map<string, ZipEntry>,
    readonly order: string[],
    readonly limits: ZipLimits,
    public unpacked: number,
  ) {}

  /** Opens [bytes]: throws notPackage for something that isn't a ZIP file and damaged for one over a limit. */
  static open(bytes: Uint8Array, limits: ZipLimits, alreadyUnpacked = 0, notZipProblem: 'notPackage' | 'damaged' = 'notPackage'): SafeZip {
    const fail = () => new AvloryFileError(notZipProblem, notZipProblem === 'notPackage' ? "This isn't an Avlory file, or it's damaged." : 'This file is damaged.');
    if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw fail();
    const count = zipEntryCount(bytes);
    if (count === null) throw fail();
    if (count > limits.maxEntries) throw tooBig();
    // Find the end record again for the directory's place
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 0xffff); i--) {
      if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
        eocd = i;
        break;
      }
    }
    let dirOffset = u32(bytes, eocd + 16);
    let dirCount = u16(bytes, eocd + 10);
    if (dirOffset === 0xffffffff || dirCount === 0xffff) {
      const loc = eocd - 20;
      if (loc >= 0 && u32(bytes, loc) === 0x07064b50) {
        const at = u32(bytes, loc + 8) + u32(bytes, loc + 12) * 0x100000000;
        if (at + 56 > bytes.length || u32(bytes, at) !== 0x06064b50) throw fail();
        dirCount = u32(bytes, at + 32) + u32(bytes, at + 36) * 0x100000000;
        dirOffset = u32(bytes, at + 48) + u32(bytes, at + 52) * 0x100000000;
      }
    }
    if (dirCount > limits.maxEntries) throw tooBig();
    const entries = new Map<string, ZipEntry>();
    const order: string[] = [];
    const decoder = new TextDecoder('utf-8');
    let p = dirOffset;
    let declared = 0;
    try {
      for (let n = 0; n < dirCount; n++) {
        if (u32(bytes, p) !== 0x02014b50) throw fail();
        const method = u16(bytes, p + 10);
        let compressedSize = u32(bytes, p + 20);
        let size = u32(bytes, p + 24);
        const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
        let localOffset = u32(bytes, p + 42);
        if (p + 46 + nameLen > bytes.length) throw fail();
        const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        // ZIP64 sizes and offset
        let e = p + 46 + nameLen;
        const end = e + extraLen;
        while (e + 4 <= end) {
          const id = u16(bytes, e), len = u16(bytes, e + 2);
          if (id === 0x0001) {
            let q = e + 4;
            const read64 = () => {
              const v = u32(bytes, q) + u32(bytes, q + 4) * 0x100000000;
              q += 8;
              return v;
            };
            if (size === 0xffffffff) size = read64();
            if (compressedSize === 0xffffffff) compressedSize = read64();
            if (localOffset === 0xffffffff) localOffset = read64();
          }
          e += 4 + len;
        }
        if (size > limits.maxEntryBytes) throw tooBig();
        declared += size;
        if (!entries.has(name)) {
          entries.set(name, { name, method, compressedSize, size, localOffset });
          order.push(name);
        }
        p = end + commentLen;
      }
    } catch (err) {
      if (err instanceof AvloryFileError) throw err;
      throw fail();
    }
    if (declared > limits.maxTotalBytes) throw tooBig();
    return new SafeZip(bytes, entries, order, limits, alreadyUnpacked);
  }

  has(name: string): boolean {
    return this.entries.has(name);
  }

  /** The first entry's name, method and where its data starts (for checking `mimetype`). */
  firstLocal(): { name: string; method: number; extraLength: number } | null {
    if (this.bytes.length < 30 || u32(this.bytes, 0) !== 0x04034b50) return null;
    const nameLen = u16(this.bytes, 26);
    return {
      name: new TextDecoder().decode(this.bytes.subarray(30, 30 + nameLen)),
      method: u16(this.bytes, 8),
      extraLength: u16(this.bytes, 28),
    };
  }

  /** [name]'s bytes, unpacked within the limits; null when there's no such part. */
  async read(name: string): Promise<Uint8Array | null> {
    const e = this.entries.get(name);
    if (!e) return null;
    const b = this.bytes;
    const at = e.localOffset;
    if (at + 30 > b.length || u32(b, at) !== 0x04034b50) throw new AvloryFileError('damaged', 'This file is damaged.');
    const start = at + 30 + u16(b, at + 26) + u16(b, at + 28);
    const data = b.subarray(start, Math.min(b.length, start + e.compressedSize));
    const cap = Math.min(this.limits.maxEntryBytes, this.limits.maxTotalBytes - this.unpacked);
    let out: Uint8Array;
    if (e.method === 0) {
      if (data.length > cap) throw tooBig();
      out = data.slice();
    } else if (e.method === 8) {
      out = await inflateCapped(data, cap, () => {
        // Overlapping parts and crafted streams inflate far past what deflate can do honestly
        return this.unpacked > this.limits.ratioFloor && this.unpacked > this.bytes.length * this.limits.maxRatio;
      }, (n) => (this.unpacked += n));
      return out;
    } else {
      throw new AvloryFileError('damaged', 'This file is damaged.');
    }
    this.unpacked += out.length;
    return out;
  }
}

async function inflateCapped(data: Uint8Array, cap: number, overRatio: () => boolean, count: (n: number) => void): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      count(value.length);
      if (total > cap || overRatio()) {
        await reader.cancel().catch(() => {});
        throw tooBig();
      }
      chunks.push(value);
    }
  } catch (err) {
    if (err instanceof AvloryFileError) throw err;
    throw new AvloryFileError('damaged', 'This file is damaged.');
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

// --- writing ---

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data).catch(() => {});
  writer.close().catch(() => {});
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/** A ZIP file of [files], in order; [stored] names are stored, the rest deflated. */
export async function writeZip(files: [string, Uint8Array][], stored: Set<string> = new Set()): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = enc.encode(name);
    const store = stored.has(name);
    const body = store ? data : await deflate(data);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, store ? 0 : 8, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, body.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, store ? 0 : 8, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    parts.push(local, body);
    central.push(cen);
    offset += local.length + body.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, dirSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let o = 0;
  for (const c of all) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}
