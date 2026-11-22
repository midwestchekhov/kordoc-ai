#!/usr/bin/env node
// 족보 HWP·HWPX → 본문·급분바 마크다운 + 문제은행 JSON
// 사용: node jokbo.mjs <족보 파일이나 폴더…> [-o 출력폴더]   (출력 기본: 첫 입력 옆 "변환결과")
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import os from 'node:os';
const here=path.dirname(fileURLToPath(import.meta.url)); const args=process.argv.slice(2);
const oi=args.indexOf('-o'); let out=null; if(oi>=0){ out=args[oi+1]; args.splice(oi,2); }
if(!args.length){ console.error('사용: node jokbo.mjs <족보 파일이나 폴더…> [-o 출력폴더]'); process.exit(1); }
const inputs=args.map(a=>path.resolve(a));
for(const p of inputs) if(!fs.existsSync(p)){ console.error('없는 경로: '+p); process.exit(1); }
out=path.resolve(out||path.join(fs.statSync(inputs[0]).isDirectory()?path.dirname(inputs[0]):path.dirname(inputs[0]),'변환결과')); fs.mkdirSync(out,{recursive:true});
const run=(script,a,env={})=>{ const r=spawnSync(process.execPath,[path.join(here,'lib',script),...a],{stdio:'inherit',env:{...process.env,...env},cwd:here}); if(r.status!==0){ console.error(script+' 실패'); process.exit(r.status||1);} };
console.log('1/3 본문·급분바 변환·강조·그림'); run('convert.mjs',[out,...inputs]);
// questions.mjs 는 폴더 하나씩: 파일 입력은 임시 폴더에 링크
const dirs=new Map(); for(const p of inputs){ if(fs.statSync(p).isDirectory()) dirs.set(p,null); else { const d=path.dirname(p); if(!dirs.has(d)) dirs.set(d,new Set()); dirs.get(d)?.add(path.basename(p)); } }
console.log('2/3 문제은행·그림 목록');
for(const [d,only] of dirs){ let src=d; if(only){ src=fs.mkdtempSync(path.join(os.tmpdir(),'jokbo-')); for(const f of only) fs.symlinkSync(path.join(d,f),path.join(src,f)); }
  run('questions.mjs',[out],{DIR:src}); if(only) try{ fs.rmSync(src,{recursive:true,force:true}); }catch{} }
console.log('3/3 해마다 나온 문항 묶기'); run('recurrence.mjs',[out]);
console.log('끝: '+out);
