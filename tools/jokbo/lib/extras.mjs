// 강조요약·표 목록 (convert 가 쓴다). kordoc 표 IR: cells[행][열], 합친 칸은 colSpan·rowSpan, 덮인 자리는 빈 칸으로 온다.
import { hdr, isQuestionRow } from './sections.mjs';

const IMG = /!\[[^\]]*\]\(([^)]+)\)/g;
export const imagesIn = s => [...new Set([...(s || '').matchAll(IMG)].map(m => m[1].replace(/^images\//, '')))];

// 합친 칸을 풀어 덮인 자리마다 같은 글을 채운다 (머리 칸이 그림뿐이면 그 그림을 머리 글로)
export function expandTable(t, fmt = x => x) {
  const R = t.rows || t.cells.length, C = t.cols || Math.max(...t.cells.map(r => r.length));
  const g = Array.from({ length: R }, () => Array(C).fill(null));
  t.cells.forEach((row, ri) => { let ci = 0; for (const c of row) {
    while (ci < C && g[ri][ci] !== null) ci++; if (ci >= C) break;
    const txt = fmt((c.text || '').trim()), rs = c.rowSpan || 1, cs = c.colSpan || 1;
    for (let dr = 0; dr < rs && ri + dr < R; dr++) for (let dc = 0; dc < cs && ci + dc < C; dc++) if (g[ri + dr][ci + dc] === null) g[ri + dr][ci + dc] = txt;
    ci += cs;
    // kordoc 는 덮인 자리도 빈 칸으로 넣는다: 그 빈 칸은 건너뛴다
  } });
  // 덮인 자리용 빈 칸이 행에 그대로 있어 위 계산이 밀리지 않도록, 행 길이가 C 인 꼴이면 자리 그대로 다시 채운다
  if (t.cells.every(r => r.length === C)) {
    const h = Array.from({ length: R }, () => Array(C).fill(null));
    t.cells.forEach((row, ri) => row.forEach((c, ci) => { if (h[ri][ci] !== null) return; const rs = c.rowSpan || 1, cs = c.colSpan || 1, txt = fmt((c.text || '').trim());
      for (let dr = 0; dr < rs && ri + dr < R; dr++) for (let dc = 0; dc < cs && ci + dc < C; dc++) h[ri + dr][ci + dc] = txt; }));
    return h.map(r => r.map(x => x ?? ''));
  }
  return g.map(r => r.map(x => x ?? ''));
}
const cellMd = s => s.replace(/\|/g, '\\|').replace(/\n+/g, '<br>');
export const gfm = rows => !rows.length ? '' : [rows[0], rows[0].map(() => '---'), ...rows.slice(1)].map(r => '| ' + r.map(cellMd).join(' | ') + ' |').join('\n');
export const merged = t => t.cells.flat().some(c => (c.colSpan || 1) > 1 || (c.rowSpan || 1) > 1);

const NEG = /나오지\s*않|안\s*나[와옴오]|범위\s*(밖|아님|X)|몰라도|넘어가|스킵|skip|중요하지\s*않/i;
const plainOf = b => (b.spans ? b.spans.map(x => x.text).join('') : b.text || '').replace(/[\uE000-\uF8FF]/g, '').trim();
// 제목꼴: 제목 블록, 또는 짧은 문단이 번호·기호·王 으로 시작하거나 王 으로 끝나는 것
const HEADINGISH = b => b.type === 'heading' || (b.type === 'paragraph' && plainOf(b).length <= 80 && (/^\s*([\dA-Za-z가-힣]{1,3}[.)]|[★■□▶◆●○Ⅰ-Ⅻ#]|王)/.test(plainOf(b)) || /王\s*$/.test(plainOf(b))));

// 표 목록: 장마다 남는 표(장 제목 표·문항 표 빼고), 병합을 푼 Markdown, 강조 점수, 그림
export function tableList({ blocks, secOf, emph, unwrap, fmt }) {
  const score = new Map(); for (const e of emph) score.set(e.top, (score.get(e.top) || 0) + ({ 3: 3, 2: 2, 1: 1 }[e.level] || 0));
  const out = [];
  blocks.forEach((b, i) => { const sec = secOf[i]; if (!sec || b.type !== 'table' || hdr(b)) return;
    for (const x of unwrap([b])) { if (x.type !== 'table' || x.table.cells.some(isQuestionRow)) continue;
      const rows = expandTable(x.table, fmt); const md = gfm(rows);
      out.push({ id: `t${out.length + 1}`, section: `${sec.num}. ${sec.title}`, kind: sec.kind, rows: rows.length, cols: rows[0]?.length || 0, merged: merged(x.table), emphasis: score.get(i) || 0, images: imagesIn(md), markdown: md }); } });
  return out;
}

// 강조요약: level 3·2 조각마다 그것이 걸린 문단·표 전체(제목꼴이면 그 아래 몇 블록까지)와 그림
export function emphSummary({ blocks, secOf, emph, unwrap, render, fmt }) {
  const byTop = new Map(); for (const e of emph) if (e.level >= 2 && !e.aside && e.top != null) { if (!byTop.has(e.top)) byTop.set(e.top, []); byTop.get(e.top).push(e); }
  const kingTops = new Set(emph.filter(e => e.level === 3).map(e => e.top));
  const items = [], covered = new Map();
  for (const [top, es] of [...byTop].sort((a, b) => a[0] - b[0])) {
    const b = blocks[top], sec = secOf[top]; if (!b || !sec) continue;
    const level = Math.max(...es.map(e => e.level)), texts = [...new Set(es.map(e => e.text))];
    // 앞 항목(제목 + 그 아래)에 이미 들어간 블록이면 그 항목에 강조 글만 더한다
    if (covered.has(top)) { const it = covered.get(top); it.emphasized = [...new Set([...it.emphasized, ...texts])]; it.level = Math.max(it.level, level); continue; }
    let context, scope;
    if (b.type === 'table' && !hdr(b)) {
      const parts = unwrap([b]); context = parts.every(x => x.type === 'table') && parts.length === 1 ? gfm(expandTable(parts[0].table, fmt)) : render([b]); scope = 'table';
    } else if (level === 3 && HEADINGISH(b)) {
      const tail = []; let n = 0;
      for (let j = top + 1; j < blocks.length && n < 6 && secOf[j] === sec && !kingTops.has(j) && blocks[j].type !== 'heading'; j++, n++) tail.push(blocks[j]);
      context = render([b, ...tail]); scope = 'heading+following'; tail.forEach((_, k) => covered.set(top + 1 + k, null));
    } else { context = render([b]); scope = 'block'; }
    if (context.length > 4000) context = context.slice(0, 4000) + '\n…(줄임)';
    const item = { section: `${sec.num}. ${sec.title}`, kind: sec.kind, level, emphasized: texts, scope, negative: NEG.test(texts.join(' ') + ' ' + context.slice(0, 200)), images: imagesIn(context), context };
    items.push(item); for (const [k, v] of covered) if (v === null) covered.set(k, item);
  }
  return items;
}
