// 티로 노트를 강의 결과 폴더에 붙인다: 날짜·교시·교수님으로 맞춰 <강의>/티로_강조.md
//
// 노트 폴더에는 노트 하나에 파일 하나 (.md·.txt·.json). 노트를 파일로 내려 두는 건 Cowork 의 Claude 가 티로 연결로 한다.
//   .json : { title, createdAt, summary?, documents?: [{content}], transcript?, text? }
//   .md·.txt : 맨 위 front matter(title:·date:·createdAt:) 또는 첫 줄 제목. 날짜는 front matter → 파일 이름(20261124·2026-11-24) 순으로
// 티로 노트 제목은 보통 "8교시 조민수 교수님", "1교시 천재희, 박수정 교수님".
import fs from 'node:fs'; import path from 'node:path';
import { fileMeta } from './meta.mjs';

const KST = 9 * 3600e3;
const ymd = s => { if (!s) return null; const m = /(20\d\d)-?(\d\d)-?(\d\d)/.exec(s); if (!m) return null;
  if (/T\d\d:/.test(s)) { const d = new Date(new Date(s).getTime() + KST); return d.toISOString().slice(0, 10); }
  return `${m[1]}-${m[2]}-${m[3]}`; };
const periodsOf = s => { const m = /(\d[\d,\s·]*)\s*교시/.exec(s || ''); return m ? m[1].split(/[,\s·]+/).filter(Boolean) : []; };
export const profsOf = s => { const m = /([가-힣,\s·]+?)\s*교수님/.exec((s || '').replace(/\d[\d,\s·]*\s*교시/g, ' ')); return m ? m[1].split(/[,\s·]+/).filter(x => /^[가-힣]{2,4}$/.test(x)) : []; };

export function readNote(fp) {
  const raw = fs.readFileSync(fp, 'utf8'), name = path.basename(fp).normalize('NFC');
  let title = null, date = null, text = raw;
  if (/\.json$/i.test(fp)) { const j = JSON.parse(raw); title = j.title; date = ymd(j.createdAt || j.date);
    text = [j.summary, ...(j.documents || []).map(d => d.content || d.text || ''), j.text, j.transcript && (typeof j.transcript === 'string' ? j.transcript : JSON.stringify(j.transcript))].filter(Boolean).join('\n\n'); }
  else { const fm = /^---\n([\s\S]*?)\n---\n/.exec(raw);
    if (fm) { text = raw.slice(fm[0].length); for (const l of fm[1].split('\n')) { const [k, ...v] = l.split(':'); const val = v.join(':').trim().replace(/^["']|["']$/g, '');
        if (k.trim() === 'title') title = val; if (k.trim() === 'date' || k.trim() === 'createdAt') date = ymd(val); } }
    title ??= text.split('\n').find(l => l.trim())?.replace(/^#+\s*/, '').trim(); }
  date ??= ymd(name);
  const label = (title || '') + ' ' + name;
  return { file: name, title: title || name, date, periods: periodsOf(label), profs: profsOf(title || '').length ? profsOf(title) : profsOf(name), text: text.trim() };
}

// 교수님이 같고, 교시가 겹치거나 날짜가 같아야 맞춘다
export function score(note, lec) {
  if (!lec.professor || !note.profs.includes(lec.professor)) return 0;
  const lp = (lec.period || '').split(',').filter(Boolean), pOk = note.periods.some(p => lp.includes(p));
  const dOk = note.date && lec.date && note.date === lec.date;
  const near = note.date && lec.date && Math.abs(new Date(note.date) - new Date(lec.date)) <= 3 * 86400e3;
  if (!pOk && !dOk) return 0;
  return 2 + (pOk ? 2 : 0) + (dOk ? 3 : near ? 1 : 0);
}

const EMPH = /강조|중요|시험|출제|꼭|반드시|외우|외워|기억|나온다|나옵니다|족보|王|★|핵심/;
export function attachTiro(noteDir, out) {
  const notes = fs.readdirSync(noteDir).filter(f => /\.(md|txt|json)$/i.test(f) && !f.startsWith('.')).map(f => { try { return readNote(path.join(noteDir, f)); } catch { return null; } }).filter(Boolean);
  const lectures = fs.readdirSync(out).filter(d => fs.statSync(path.join(out, d)).isDirectory() && !d.startsWith('_') && !d.startsWith('.')).map(d => ({ dir: d, ...fileMeta(d) }));
  const byLec = new Map(), unmatched = [];
  for (const n of notes) {
    let best = null, bs = 0; for (const l of lectures) { const s = score(n, l); if (s > bs) { bs = s; best = l; } }
    if (best) { if (!byLec.has(best.dir)) byLec.set(best.dir, []); byLec.get(best.dir).push(n); } else unmatched.push(`${n.file} (${n.title})`);
  }
  for (const [dir, ns] of byLec) {
    ns.sort((a, b) => (a.periods[0] || '').localeCompare(b.periods[0] || '', undefined, { numeric: true }));
    const md = [`# 티로 노트: ${dir}`, ''];
    for (const n of ns) {
      const hits = [...new Set(n.text.split('\n').map(l => l.trim()).filter(l => l && EMPH.test(l)))];
      md.push(`## ${n.title}`, '', `출처: \`${n.file}\`${n.date ? ` (${n.date})` : ''}`, '');
      if (hits.length) md.push('### 강조로 보이는 줄', '', ...hits.map(l => '- ' + l.replace(/^[-*•]\s*/, '')), '');
      md.push('### 노트 전문', '', n.text, '');
    }
    fs.writeFileSync(path.join(out, dir, '티로_강조.md'), md.join('\n'));
  }
  return { matched: byLec.size, notes: notes.length, unmatched };
}
