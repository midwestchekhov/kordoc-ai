// 족보 장 나누기·갈래 정하기 (convert·questions 가 같이 쓴다)
//
// 장 제목: 1행 2열 표 `| Ⅰ | 제목 |` (없으면 본문 문단 "Ⅰ. 제목" 을 쓴다).
// 갈래: 제목 글자 → 안 맞으면 내용(문항 표 비율)으로.
//   summary  급분바·앞분바·끕분바·X분바·쁀뺘 같은 변형, 요약·정리·Summary
//   exam     문족·기출
//   practice 확인·자작·예상·연습 문제, 퀴즈
//   body     그 밖 (필족 본문)
//   prelude  첫 장 제목 앞 (표지·목차·족원 말·출제 경향)

export const ROMAN = /^(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|Ⅺ|Ⅻ|X{0,1}(?:IX|IV|V?I{0,3}))\.?$/;
export const cleanTitle = t => t.split('\n')[0].replace(/\s+(\d{2})?(교수님|족원|족장|족|교)\)\s.*$/, '').trim();

export function hdr(b) {
  if (b.type !== 'table' || b.table.rows !== 1 || b.table.cols !== 2) return null;
  const [a, t] = b.table.cells[0].map(c => (c.text || '').trim());
  return a && ROMAN.test(a) && t ? { num: a.replace(/\.$/, ''), title: cleanTitle(t) } : null;
}
const PARA_HDR = /^\s*(Ⅰ|Ⅱ|Ⅲ|Ⅳ|Ⅴ|Ⅵ|Ⅶ|Ⅷ|Ⅸ|Ⅹ|Ⅺ|Ⅻ|X{0,1}(?:IX|IV|V?I{1,3}|V))\.\s+(\S.{0,60})$/;
function paraHdr(b) {
  if (b.type !== 'paragraph' && b.type !== 'heading') return null;
  const m = PARA_HDR.exec(b.text || ''); return m ? { num: m[1], title: cleanTitle(m[2]) } : null;
}

// ---- "분바" 변형: 분바·쁀뺘·뿐빠·폰본바… (첫 자: ㅂㅃㅍ + ㅜ·ㅗ계열 모음 + ㄴ받침, 둘째 자: ㅂㅃㅍ + ㅏ계열 모음, 받침 없음)
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const jamo = ch => { const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return null; return { cho: CHO[Math.floor(c / 588)], jung: JUNG[Math.floor((c % 588) / 28)], jong: c % 28 }; };
const B = new Set(['ㅂ', 'ㅃ', 'ㅍ']), U = new Set(['ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅗ', 'ㅛ']), A = new Set(['ㅏ', 'ㅑ', 'ㅘ']);
export function hasBunba(t) {
  const s = [...(t || '')];
  for (let i = 0; i + 1 < s.length; i++) {
    const a = jamo(s[i]), b = jamo(s[i + 1]);
    if (a && b && B.has(a.cho) && U.has(a.jung) && a.jong === 4 /* ㄴ */ && B.has(b.cho) && A.has(b.jung) && b.jong === 0) return true;
  }
  return false;
}

export function classifyTitle(t) {
  if (/(확인|자작|예상|연습|모의|복습)\s*문제|퀴즈|quiz/i.test(t)) return { kind: 'practice', reason: 'title' };
  if (hasBunba(t) || /요약|핵심\s*정리|정리본|^\s*정리|summary/i.test(t)) return { kind: 'summary', reason: 'title' };
  if (/문족|기출|족보\s*문제|past\s*exam/i.test(t)) return { kind: 'exam', reason: 'title' };
  return { kind: 'body', reason: 'title' };
}

// 문항 줄: 2칸 표의 한 줄, 오른칸이 "정답" 으로 시작하고 그 뒤에 답이 있다 (급분바 표의 "정답률"·"정답을 가르는 조건" 같은 칸은 아님)
export const isQuestionRow = row => row.length === 2 && (row[0]?.text || '').trim().length >= 2 && /^\s*정답\s*([\/:|\n]|\s)\s*\S/.test(row[1]?.text || '');
export function questionRows(blocks) {
  let q = 0, tables = 0;
  for (const b of blocks) if (b.type === 'table' && !hdr(b)) { tables++; if (b.table.cols === 2) q += b.table.cells.filter(isQuestionRow).length; }
  return { q, tables };
}

const qRowsOf = b => b.type === 'table' && b.table.cols === 2 && !hdr(b) ? b.table.cells.filter(isQuestionRow).length : 0;
const GROUP_HEAD = /문족|기출|족보\s*문제|\d{2,4}\s*년|^\s*[A-Z]\.\s|평가|교수님|Part\s*\d/i;
// 장 안에서 문족이 시작하는 블록 번호 (없으면 -1): 첫 문항 표부터 끝까지 문항 표가 2줄 이상이고 다른 표보다 많을 때.
// 첫 문항 표 바로 앞의 짧은 묶음 제목 문단("2025년 문족", "A. …")도 같이 가져간다
export function nestedExamStart(bs) {
  const qi = bs.findIndex(b => qRowsOf(b) > 0); if (qi < 0) return -1;
  let q = 0, other = 0; for (const b of bs.slice(qi)) if (b.type === 'table' && !hdr(b)) { const n = qRowsOf(b); if (n) q += n; else other++; }
  if (q < 2 || q < other) return -1;
  let at = qi; for (let j = qi - 1; j >= 0 && j >= qi - 3; j--) { const b = bs[j]; const t = (b.text || '').trim();
    if ((b.type === 'paragraph' || b.type === 'heading') && t.length <= 80 && GROUP_HEAD.test(t)) at = j; else if (b.type === 'paragraph' && !t) continue; else break; }
  return at;
}

// 블록을 장으로 나눈다. secOf[i] = blocks[i] 가 속한 장 (장 제목 블록은 null)
export function splitSections(blocks) {
  const useTables = blocks.some(hdr);
  const find = useTables ? hdr : paraHdr;
  const secs = [{ num: '0', title: '머리말', kind: 'prelude', reason: 'position', blocks: [] }];
  const secOf = [];
  for (const b of blocks) {
    const h = find(b);
    if (h) { secs.push({ ...h, ...classifyTitle(h.title), blocks: [] }); secOf.push(null); }
    else { secs.at(-1).blocks.push(b); secOf.push(secs.at(-1)); }
  }
  // 요약·본문 장 안에 문족이 통째로 들어 있으면(장 뒷부분이 문항 표 위주) 그 부분을 따로 기출 장으로 뗀다
  for (let k = secs.length - 1; k >= 1; k--) { const s = secs[k]; if (s.kind !== 'summary' && s.kind !== 'body') continue;
    const at = nestedExamStart(s.blocks); if (at < 0) continue;
    // 앞에 내용이 없으면 장 전체가 문항: 떼지 않고 장째 기출로
    if (!s.blocks.slice(0, at).some(b => b.type !== 'paragraph' || (b.text || '').trim().length > 3)) { s.kind = 'exam'; s.reason = 'content'; continue; }
    const sub = { num: s.num + '-문족', title: s.title + ' 안의 문족', kind: 'exam', reason: 'nested', blocks: s.blocks.slice(at) };
    s.blocks = s.blocks.slice(0, at); secs.splice(k + 1, 0, sub); for (const b of sub.blocks) secOf[blocks.indexOf(b)] = sub; }
  // 내용으로 고치기: 제목으로 본문인데 문항 표가 대부분이면 기출
  for (const s of secs) {
    const { q, tables } = questionRows(s.blocks); s.questionRows = q;
    if (s.kind === 'body' && q >= 2 && q >= tables * 0.5) { s.kind = 'exam'; s.reason = 'content'; }
  }
  // 요약이 하나도 없으면 알려 준다 (지어내지 않는다)
  return { secs, secOf, headerStyle: useTables ? 'table' : 'paragraph', hasSummary: secs.some(s => s.kind === 'summary') };
}

export const KIND_KO = { prelude: '머리말', body: '본문(필족)', summary: '요약(급분바 등)', exam: '기출(문족)', practice: '연습 문제' };
