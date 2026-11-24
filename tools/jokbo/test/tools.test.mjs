// 파일 이름 메타·문항 id·강조 다듬기·티로 맞추기 (kordoc 없이)
import test from 'node:test'; import assert from 'node:assert/strict';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { fileMeta, qid } from '../lib/meta.mjs';
import { tidyEmph } from '../lib/emphasis.mjs';
import { readNote, score, attachTiro, profsOf } from '../lib/tiro.mjs';

test('Mac 파일 이름(NFD)도 날짜·교시·교수님을 읽는다', () => {
  const f = '/x/소흡/필족(hwpx)/' + '20261117_3교시_샘창자, 지라, 이자의 구조_임진홍 교수님_문형주_수정(0).hwpx'.normalize('NFD');
  const m = fileMeta(f);
  assert.equal(m.date, '2026-11-17'); assert.equal(m.period, '3'); assert.equal(m.professor, '임진홍'); assert.equal(m.subject, '소화와 흡수');
  assert.equal(qid(m, 'x', 7), '20261117-3-007');
});

test('꼴이 달라도 조각마다, 못 읽으면 x (undefined 아님)', () => {
  assert.equal(fileMeta('20261123 _ 7,8 교시_간담도_김철수 교수님.hwp').period, '7,8');
  const m = fileMeta('샘창자 족보.hwpx');
  assert.equal(m.date, null); assert.equal(qid(m, '샘창자 족보', 1), 'x-x-001');
  assert.equal(qid({ date: null, period: null }, '20261123_무언가', 2), '20261123-x-002');
});

test('강조: 王만 있는 조각·잡음·중복은 거른다', () => {
  const e = (text, level = 2, section = 'Ⅰ. 급분바') => ({ section, kind: 'summary', text, level });
  const out = tidyEmph([e('王王王', 3), e('FC 세브란스 화이팅'), e('★'), e('Schilling test'), e('Schilling test', 3), e('지방산 표는 전체가 왕', 3)]);
  assert.deepEqual(out.map(x => [x.text, x.level]), [['Schilling test', 3], ['지방산 표는 전체가 왕', 3]]);
});

test('티로 노트: 제목·날짜(KST)·교수님', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'tiro-'));
  fs.writeFileSync(path.join(d, 'a.json'), JSON.stringify({ title: '1교시 천재희, 박수정 교수님', createdAt: '2026-11-23T16:30:00Z', summary: '- 이 표는 시험에 꼭 나온다\n- 기타' }));
  const n = readNote(path.join(d, 'a.json'));
  assert.equal(n.date, '2026-11-24'); assert.deepEqual(n.periods, ['1']); assert.deepEqual(n.profs, ['천재희', '박수정']);
  assert.deepEqual(profsOf('8교시 조민수 교수님'), ['조민수']);
});

test('티로 노트를 강의 폴더에 붙인다', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tiro-')), notes = path.join(root, 'notes'), out = path.join(root, 'out');
  fs.mkdirSync(notes); fs.mkdirSync(out);
  const lec = '20261124_5,6교시_간 질환_양헌무 교수님_홍길동'; fs.mkdirSync(path.join(out, lec)); fs.mkdirSync(path.join(out, '20261124_8교시_췌장_조민수 교수님_김철수'));
  fs.writeFileSync(path.join(notes, '5.md'), '---\ntitle: 5교시 양헌무 교수님\ndate: 2026-11-24\n---\n간경변 합병증은 중요\n일반 설명');
  fs.writeFileSync(path.join(notes, '6.md'), '# 6교시 양헌무 교수님\n\nMELD 점수 꼭 외우기');
  fs.writeFileSync(path.join(notes, 'x.md'), '# 3교시 아무개 교수님\n\n무관');
  const r = attachTiro(notes, out);
  assert.equal(r.matched, 1); assert.equal(r.unmatched.length, 1);
  const md = fs.readFileSync(path.join(out, lec, '티로_강조.md'), 'utf8');
  assert.match(md, /- 간경변 합병증은 중요/); assert.match(md, /- MELD 점수 꼭 외우기/); assert.ok(md.indexOf('## 5교시') < md.indexOf('## 6교시'));
  assert.equal(score({ profs: ['양헌무'], periods: ['7'], date: '2026-12-01' }, { professor: '양헌무', period: '5,6', date: '2026-11-24' }), 0);
});

import { expandTable, gfm, emphSummary } from '../lib/extras.mjs';
test('병합 칸을 풀어 Markdown 표로', () => {
  const c = (text, cs = 1, rs = 1) => ({ text, colSpan: cs, rowSpan: rs });
  const t = { rows: 3, cols: 3, cells: [[c('구분'), c('A', 2), c('')], [c('행', 1, 2), c('1'), c('2')], [c(''), c('3'), c('4|5')]] };
  assert.deepEqual(expandTable(t), [['구분', 'A', 'A'], ['행', '1', '2'], ['행', '3', '4|5']]);
  assert.equal(gfm(expandTable(t)).split('\n')[3], '| 행 | 3 | 4\\|5 |');
});

test('강조요약: 王 제목은 그 아래 블록까지, 겹치는 항목은 합친다', () => {
  const sec = { num: 'Ⅰ', title: '급분바', kind: 'summary' };
  const blocks = [{ type: 'paragraph', text: '★강조점 1. 지방산★ 王표 전체王' }, { type: 'table', table: { rows: 1, cols: 2, cells: [[{ text: 'Long' }, { text: 'Short' }]] } }, { type: 'paragraph', text: '다른 문단' }];
  const emph = [{ top: 0, level: 3, text: '표 전체', kind: 'summary' }, { top: 1, level: 2, text: 'Short', kind: 'summary' }];
  const render = bs => bs.map(b => b.text || 'TABLE').join('\n');
  const items = emphSummary({ blocks, secOf: [sec, sec, sec], emph, unwrap: x => x, render, fmt: x => x });
  assert.equal(items.length, 1); assert.equal(items[0].scope, 'heading+following'); assert.deepEqual(items[0].emphasized, ['표 전체', 'Short']);
});
