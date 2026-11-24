#!/usr/bin/env node
// 족보 HWP·HWPX → 본문·급분바 마크다운 + 문제은행 JSON
//
// 사용: node jokbo.mjs <족보 파일이나 폴더…> [-o 출력폴더] [옵션]   (출력 기본: 첫 입력 옆 "변환결과")
//   --jobs N        족보 N개를 함께 (기본 2)
//   --timeout 초    한 족보의 한 단계가 이보다 길면 끊는다 (기본 없음)
//   --budget 초     이 시간이 지나면 새 일을 시작하지 않고, 도는 일도 이 안에 끊는다. 다시 돌리면 남은 것만 이어서 한다
//   --step 단계     convert·questions·recurrence 중 그 단계만
//   --force         끝난 것도 다시
//   --tiro 폴더     티로 노트(.md·.txt·.json)를 날짜·교시·교수님으로 맞춰 강의마다 티로_강조.md 로 붙인다
//
// 족보마다 결과 폴더의 상태.json 에 단계별 완료를 적는다. done:true 는 마지막 단계까지 끝났을 때만.
// 원본(크기·수정 시각)이 같고 끝난 단계는 건너뛴다. 끝: 모두 끝 0, 남은 것 있음 2, 실패 있음 1.
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { attachTiro } from './lib/tiro.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const STEPS = ['convert', 'questions', 'recurrence'];
const STEP_KO = { convert: '본문·급분바·강조·그림', questions: '문제은행·그림 목록', recurrence: '해마다 나온 문항 묶기' };

// ---- 인자
const argv = process.argv.slice(2), opt = { jobs: 2, timeout: 0, budget: 0, step: null, force: false, out: null, tiro: null }, inputsRaw = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i], v = () => argv[++i];
  if (a === '-o') opt.out = v(); else if (a === '--jobs') opt.jobs = Math.max(1, +v() || 1);
  else if (a === '--timeout') opt.timeout = +v() || 0; else if (a === '--budget') opt.budget = +v() || 0;
  else if (a === '--step') opt.step = v(); else if (a === '--force') opt.force = true; else if (a === '--tiro') opt.tiro = v();
  else if (a === '--full') { /* 예전 옵션: 이제 늘 전부 */ } else inputsRaw.push(a);
}
if (opt.step && !STEPS.includes(opt.step)) { console.error(`--step 은 ${STEPS.join('·')} 중 하나`); process.exit(1); }
if (!inputsRaw.length && !opt.tiro) { console.error('사용: node jokbo.mjs <족보 파일이나 폴더…> [-o 출력폴더] [--jobs N] [--timeout 초] [--budget 초] [--step 단계] [--force] [--tiro 노트폴더]'); process.exit(1); }
const inputs = inputsRaw.map(a => path.resolve(a));
for (const p of inputs) if (!fs.existsSync(p)) { console.error('없는 경로: ' + p); process.exit(1); }
const files = [...new Set(inputs.flatMap(p => fs.statSync(p).isDirectory() ? fs.readdirSync(p).filter(f => /\.hwpx?$/i.test(f) && !f.startsWith('.')).sort().map(f => path.join(p, f)) : [p]))];
const out = path.resolve(opt.out || path.join(path.dirname(inputs[0] || '.'), '변환결과')); fs.mkdirSync(out, { recursive: true });

// ---- 상태
const T0 = Date.now(), left = () => opt.budget ? opt.budget * 1000 - (Date.now() - T0) : Infinity;
const baseOf = fp => path.basename(fp).normalize('NFC').replace(/\.hwpx?$/i, '');
const stateFile = fp => path.join(out, baseOf(fp), '상태.json');
function loadState(fp) {
  const st = fs.statSync(fp), sig = { size: st.size, mtimeMs: Math.round(st.mtimeMs) };
  let s = null; try { s = JSON.parse(fs.readFileSync(stateFile(fp), 'utf8')); } catch {}
  if (!s || s.size !== sig.size || s.mtimeMs !== sig.mtimeMs || opt.force) s = { source: path.basename(fp).normalize('NFC'), ...sig, steps: {}, done: false };
  return s;
}
const saveState = (fp, s) => { fs.mkdirSync(path.dirname(stateFile(fp)), { recursive: true }); s.done = STEPS.every(k => s.steps[k]?.ok); s.updated = new Date().toISOString(); fs.writeFileSync(stateFile(fp), JSON.stringify(s, null, 1)); };

// ---- 한 단계 = 자식 프로세스 하나 (끊을 수 있게)
const SCRIPT = { convert: fp => ['convert.mjs', [out, fp]], questions: fp => ['questions.mjs', [out, fp]], recurrence: fp => ['recurrence.mjs', [out, baseOf(fp)]] };
function runStep(step, fp) {
  const [script, args] = SCRIPT[step](fp);
  const limit = Math.min(opt.timeout ? opt.timeout * 1000 : Infinity, left());
  return new Promise(res => {
    const t = Date.now(), ch = spawn(process.execPath, [path.join(here, 'lib', script), ...args], { cwd: here, stdio: ['ignore', 'pipe', 'pipe'] });
    let log = ''; const keep = d => { log = (log + d).slice(-4000); }; ch.stdout.on('data', keep); ch.stderr.on('data', keep);
    let killed = false; const timer = Number.isFinite(limit) ? setTimeout(() => { killed = true; ch.kill('SIGKILL'); }, Math.max(1000, limit)) : null;
    ch.on('close', code => { clearTimeout(timer); res({ ok: code === 0 && !killed, killed, sec: +((Date.now() - t) / 1000).toFixed(1), log }); });
  });
}

// ---- 일 나누기: 족보마다 단계를 차례로, 족보끼리는 --jobs 만큼 함께
const result = []; let next = 0;
async function worker() {
  while (next < files.length) {
    const fp = files[next++], name = baseOf(fp), s = loadState(fp);
    const todo = (opt.step ? [opt.step] : STEPS).filter(k => opt.force || !s.steps[k]?.ok);
    let status = todo.length ? 'done' : 'skipped';
    for (const step of todo) {
      if (left() <= 0) { status = 'remaining'; break; }
      const need = STEPS.slice(0, STEPS.indexOf(step)).find(k => !s.steps[k]?.ok);
      if (need && !opt.step) { status = 'failed'; break; }
      console.log(`… ${name.slice(0, 40)}: ${STEP_KO[step]}`);
      const r = await runStep(step, fp);
      s.steps[step] = { ok: r.ok, sec: r.sec, at: new Date().toISOString(), ...(r.ok ? {} : { error: r.killed ? '시간 초과로 끊음' : r.log.trim().split('\n').slice(-6).join('\n') }) };
      saveState(fp, s);
      if (!r.ok) { status = r.killed ? 'remaining' : 'failed'; console.log(`✗ ${name.slice(0, 40)}: ${STEP_KO[step]} ${r.killed ? '시간 초과' : '실패'} (${r.sec}초)`); break; }
    }
    if (status === 'done' && !s.done && !opt.step) status = 'remaining';
    result.push({ 족보: name.slice(0, 40), 결과: { done: '끝', skipped: '이미 끝', remaining: '남음', failed: '실패' }[status], 초: STEPS.map(k => s.steps[k]?.sec ?? '-').join('/') });
  }
}
await Promise.all(Array.from({ length: Math.min(opt.jobs, files.length) }, worker));

if (opt.tiro) { const t = attachTiro(path.resolve(opt.tiro), out); console.log(`티로 노트: ${t.matched}개 강의에 붙임, 못 맞춘 노트 ${t.unmatched.length}개`); for (const u of t.unmatched) console.log('  - ' + u); }
if (result.length) console.table(result.sort((a, b) => a.족보.localeCompare(b.족보)));
const n = k => result.filter(r => r.결과 === k).length;
console.log(`끝: ${out}  (끝 ${n('끝') + n('이미 끝')} · 남음 ${n('남음')} · 실패 ${n('실패')})${n('남음') ? '  → 같은 명령을 다시 돌리면 남은 것만 이어서 한다' : ''}`);
process.exit(n('실패') ? 1 : n('남음') ? 2 : 0);
