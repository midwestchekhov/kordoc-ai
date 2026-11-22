// node --test test/   (kordoc 없이 블록 모양만으로 장 나누기·갈래를 본다)
import test from 'node:test'; import assert from 'node:assert/strict';
import { splitSections, classifyTitle, hasBunba } from '../lib/sections.mjs';

const H = (num, title) => ({ type: 'table', table: { rows: 1, cols: 2, cells: [[{ text: num }, { text: title }]] } });
const P = text => ({ type: 'paragraph', text });
const Q = n => ({ type: 'table', table: { rows: n, cols: 2, cells: Array.from({ length: n }, (_, i) => [{ text: `${i + 1}번 ...` }, { text: '정답 / ③' }]) } });
const kinds = blocks => splitSections(blocks).secs.map(s => s.kind).join(' ');

test('분바 변형 이름', () => {
  for (const t of ['급분바', '끕분바', '앞분바+문족', 'X분바', '끕쁀뺘', '☎폰본바☎', '뿐빠']) assert.ok(hasBunba(t), t);
  for (const t of ['혈류 분배', '분반 안내', '소장 분비', '준비물', '본문']) assert.ok(!hasBunba(t), t);
});

test('제목 갈래', () => {
  assert.equal(classifyTitle('Summary').kind, 'summary');
  assert.equal(classifyTitle('예상 문제 (족원 자작)').kind, 'practice');
  assert.equal(classifyTitle('2025 기출').kind, 'exam');
  assert.equal(classifyTitle('Ureter').kind, 'body');
});

test('전통 배치: 필족 - 급분바 - 문족', () => {
  assert.equal(kinds([P('표지'), H('Ⅰ', '식도'), P('...'), H('Ⅱ', '급분바'), P('...'), H('Ⅲ', '문족'), Q(3)]), 'prelude body summary exam');
});

test('앞분바 + 급분바 뒤에 더 있는 배치', () => {
  assert.equal(kinds([H('Ⅰ', '앞분바'), P('.'), H('Ⅱ', '식도'), H('Ⅲ', '급분바'), H('Ⅳ', '끕쁀뺘'), H('Ⅴ', '확인 문제'), Q(2), H('Ⅵ', '문족'), Q(5)]),
    'prelude summary body summary summary practice exam');
});

test('급분바 없음: hasSummary false', () => {
  const r = splitSections([H('Ⅰ', '식도'), P('.'), H('Ⅱ', '문족'), Q(2)]);
  assert.equal(r.hasSummary, false);
});

test('제목이 문족이 아니어도 문항 표가 대부분이면 기출', () => {
  const r = splitSections([H('Ⅰ', '식도'), P('.'), H('Ⅱ', '2024 1차'), Q(4)]);
  assert.deepEqual(r.secs.map(s => [s.kind, s.reason]), [['prelude', 'position'], ['body', 'title'], ['exam', 'content']]);
});

test('표 제목이 없으면 문단 "Ⅰ. 제목" 으로 나눈다', () => {
  const r = splitSections([P('목차'), P('Ⅰ. 식도'), P('...'), P('Ⅱ. 급분바'), P('...'), P('Ⅲ. 문족'), Q(2)]);
  assert.equal(r.headerStyle, 'paragraph');
  assert.equal(r.secs.map(s => s.kind).join(' '), 'prelude body summary exam');
});
