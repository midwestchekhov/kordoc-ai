// 압축 안 된 BMP 풀기 (sharp 는 BMP 를 못 읽는다). 1·4·8비트 팔레트, 16·24·32비트, 위아래 어느 쪽 줄 차례든.
// 압축된 BMP(RLE)는 null.
export const isBmp = b => b && b.length > 54 && b[0] === 0x42 && b[1] === 0x4d;
export function decodeBmp(buf) {
  if (!isBmp(buf)) return null;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const off = dv.getUint32(10, true), hs = dv.getUint32(14, true);
  const w = dv.getInt32(18, true), h0 = dv.getInt32(22, true), bpp = dv.getUint16(28, true), comp = hs >= 40 ? dv.getUint32(30, true) : 0;
  if (w <= 0 || h0 === 0 || ![0, 3].includes(comp)) return null;
  const h = Math.abs(h0), topDown = h0 < 0, stride = Math.floor((w * bpp + 31) / 32) * 4;
  if (off + stride * h > buf.length) return null;
  let masks = null; if (comp === 3 && hs >= 52) masks = [dv.getUint32(54, true), dv.getUint32(58, true), dv.getUint32(62, true)];
  const pal = []; if (bpp <= 8) { const n = (hs >= 40 && dv.getUint32(46, true)) || 1 << bpp; for (let i = 0; i < n; i++) { const p = 14 + hs + i * 4; pal.push([buf[p + 2], buf[p + 1], buf[p]]); } }
  const out = Buffer.alloc(w * h * 3);
  const chan = (v, m) => { if (!m) return 0; let s = 0; while (!((m >> s) & 1)) s++; const bits = (m >>> s).toString(2).length; return Math.round(((v & m) >>> s) * 255 / ((1 << bits) - 1)); };
  for (let y = 0; y < h; y++) {
    const row = off + (topDown ? y : h - 1 - y) * stride, o = y * w * 3;
    for (let x = 0; x < w; x++) { let r, g, b;
      if (bpp === 24) { const p = row + x * 3; b = buf[p]; g = buf[p + 1]; r = buf[p + 2]; }
      else if (bpp === 32) { const p = row + x * 4; if (masks) { const v = dv.getUint32(p, true); r = chan(v, masks[0]); g = chan(v, masks[1]); b = chan(v, masks[2]); } else { b = buf[p]; g = buf[p + 1]; r = buf[p + 2]; } }
      else if (bpp === 16) { const v = dv.getUint16(row + x * 2, true); const m = masks || [0x7c00, 0x3e0, 0x1f]; r = chan(v, m[0]); g = chan(v, m[1]); b = chan(v, m[2]); }
      else if (bpp <= 8) { const bit = x * bpp, byte = buf[row + (bit >> 3)], idx = (byte >> (8 - bpp - (bit & 7))) & ((1 << bpp) - 1); [r, g, b] = pal[idx] || [0, 0, 0]; }
      else return null;
      out[o + x * 3] = r; out[o + x * 3 + 1] = g; out[o + x * 3 + 2] = b; }
  }
  return { data: out, width: w, height: h, channels: 3 };
}
