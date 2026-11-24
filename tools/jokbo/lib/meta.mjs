// 족보 파일 이름·머리 표에서 과목·수업·교수님·날짜·교시 (questions·tiro 가 같이 쓴다)
import path from 'node:path';
export const SUBJECT_BY_FOLDER={'소흡':'소화와 흡수'};
export const yr=s=>{ const m=/(20\d\d)\s*년/.exec(s||'')||/(?:^|\D)(\d\d)년/.exec(s||''); return m? (m[1].length===2? 2000+ +m[1] : +m[1]) : null; };
export const profIn=s=>{ const m=/([가-힣]{2,4})\s*교수님/.exec(s||''); return m && !/모름/.test(s)? m[1] : null; };
// ---- metadata from file
export function fileMeta(fp, blocks=[]){
  const f=path.basename(fp).normalize('NFC');
  const folder=fp.includes(path.sep)? path.basename(path.dirname(path.dirname(path.resolve(fp)))).normalize('NFC') : '';
  // 정해진 꼴 "날짜_N교시_강의_교수님_작성자" 가 아니어도 조각마다 따로 찾는다
  const m=/^(\d{8})\s*_\s*([\d,\s]+?)\s*교시\s*_\s*(.+?)_\s*([가-힣]{2,4})\s*교수님(?:\s*_\s*([가-힣]{2,4}))?/.exec(f);
  const d=m?.[1] ?? /(?:^|\D)(20\d{6})(?:\D|$)/.exec(f)?.[1];
  const period=(m?.[2] ?? /(\d[\d,\s]*?)\s*교시/.exec(f)?.[1])?.replace(/\s/g,'');
  const meta={ subject: SUBJECT_BY_FOLDER[folder]||folder, lecture: m?.[3].trim(), professor: m?.[4] ?? profIn(f), date: d? `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`:null, period: period||null, author: m?.[5] ?? null };
  for(const b of blocks.slice(0,5)) if(b.type==='table'){ const t=b.table.cells.flat().map(c=>c.text).join('\n'); const s=/<([^>]+)>\s*([가-힣]{2,4})\s*교수님/.exec(t);
    if(s){ meta.subject=s[1].trim(); meta.professor=s[2]; const l=b.table.cells[1]?.[0]?.text.split('\n')[0].trim(); if(l) meta.lecture=l; break; } }
  for(const b of blocks.slice(0,40)) if(b.type==='table'){ const t=b.table.cells.flat().map(c=>c.text).join(' '); const y=/처음\s*들어오신\s*연도\s*(20\d\d)/.exec(t); if(y){ meta.first_year=+y[1]; break; } }
  return meta;
}
// 문항 id: 날짜8자리-교시-번호. 날짜·교시를 못 읽으면 x
export const qid=(fm,base,n)=>`${fm.date?fm.date.replace(/-/g,''):(/^\d{8}/.exec(base)?.[0]||'x')}-${(fm.period||'x').replace(/,/g,'_')}-${String(n).padStart(3,'0')}`;
