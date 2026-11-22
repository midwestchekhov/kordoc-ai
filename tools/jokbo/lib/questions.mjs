import { parse } from 'kordoc'; import fs from 'fs'; import path from 'path';
const dir=process.env.DIR, OUT=process.argv[2];
const SUBJECT_BY_FOLDER={'소흡':'소화와 흡수'};
import { splitSections, hdr } from './sections.mjs';
const N=t=>(t||'').replace(/[➀-➄]/g,c=>String.fromCharCode(0x2460+c.charCodeAt(0)-0x2780));
const IMG=/!\[[^\]]*\]\(([^)]+)\)/g, imgsIn=s=>[...(s||'').matchAll(IMG)].map(m=>m[1]), noImg=s=>(s||'').replace(IMG,'').replace(/\n{2,}/g,'\n').trim();
const yr=s=>{ const m=/(20\d\d)\s*년/.exec(s||'')||/(?:^|\D)(\d\d)년/.exec(s||''); return m? (m[1].length===2? 2000+ +m[1] : +m[1]) : null; };
const profIn=s=>{ const m=/([가-힣]{2,4})\s*교수님/.exec(s||''); return m && !/모름/.test(s)? m[1] : null; };
const examIn=s=>(/(1차|2차|중간평가|분기말평가|재시험|기말|본1|본2|CDP\d{4})/g.exec(s||'')||[])[0]||null;

// ---- metadata from file
function fileMeta(f, blocks){
  const folder=path.basename(path.dirname(path.dirname(fs.realpathSync(path.join(dir,f)))));
  const m=/^(\d{8})_([\d,]+)교시_(.+?)_\s*([가-힣]{2,4})\s*교수님_([가-힣]{2,4})/.exec(f);
  const meta={ subject: SUBJECT_BY_FOLDER[folder]||folder, lecture: m?.[3].trim(), professor: m?.[4], date: m? `${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`:null, period: m?.[2], author: m?.[5] };
  for(const b of blocks.slice(0,5)) if(b.type==='table'){ const t=b.table.cells.flat().map(c=>c.text).join('\n'); const s=/<([^>]+)>\s*([가-힣]{2,4})\s*교수님/.exec(t);
    if(s){ meta.subject=s[1].trim(); meta.professor=s[2]; const l=b.table.cells[1]?.[0]?.text.split('\n')[0].trim(); if(l) meta.lecture=l; break; } }
  for(const b of blocks.slice(0,40)) if(b.type==='table'){ const t=b.table.cells.flat().map(c=>c.text).join(' '); const y=/처음\s*들어오신\s*연도\s*(20\d\d)/.exec(t); if(y){ meta.first_year=+y[1]; break; } }
  return meta;
}
function question(row){
  const L={...row[0],text:N(row[0].text)}, R={...row[1],text:N(row[1].text)}; if(!/정답/.test(R.text)) return null;
  let answer=null, expl;
  const nt=(R.blocks||[]).find(x=>x.type==='table');
  if(nt && /정답/.test(nt.table.cells[0][0].text)) { answer=N(nt.table.cells[0][1]?.text).trim(); expl=(R.blocks||[]).filter(x=>x!==nt).map(x=>x.text??'').join('\n'); }
  else { answer=/정답\s*\/?\s*([^\n]*)/.exec(R.text)?.[1].trim(); expl=R.text.replace(/^[\s\S]*?정답[^\n]*\n?/,''); }
  expl=expl.replace(/^\s*<해설>\s*/,'').trim();
  const lines=L.text.split('\n'), header=lines[0].trim(), ci=lines.findIndex(l=>/^\s*[①②③④⑤]/.test(l));
  const choices=ci<0?[]:lines.slice(ci).join('\n').split(/(?=[①②③④⑤])/).map(s=>s.trim()).filter(Boolean);
  const stem=(ci<0?lines.slice(1):lines.slice(1,ci)).join('\n').trim();
  const type=choices.length>=2?'mcq':/OX|O,\s*X/i.test(header)||/^[OX]$/.test(answer||'')?'ox':/해설\s*참조/.test(answer||'')?'recall':'short';
  return {header, stem: stem||header, choices, answer, explanation:expl, type, images:[...imgsIn(L.text),...imgsIn(R.text)]};
}
// same question in several years: "25년 1차 76번 = 24년 1차 75번"
const appearances=h=>{ const parts=h.split(/\s*=\s*/); if(parts.length<2) return null; return parts.map(p=>({year:yr(p), exam:examIn(p), number:(/(\d+)\s*번/.exec(p)||[])[1]||null, raw:p.trim()})); };

// ---- image notes
const EMPH=/王|★|강조|중요|꼭|외우|외워|시험|출제|문족|만년|기억/; const PASS=/언급\s*(없|X|안)|넘어가|넘기|참고(만|용)|알\s*필요(는|가)?\s*없|중요하지\s*않|설명\s*X|안\s*하셨|스킵|skip/i;
function judge(ctx){ const e=EMPH.test(ctx), p=PASS.test(ctx); return p&&!e?'passed':e&&!p?'emphasized':e&&p?'mixed':'neutral'; }
function collectImages(blocks, secOf){
  const out=[]; const seen=new Set();
  const add=(name,sec,ctx,where)=>{ const key=name+'|'+where; if(seen.has(key)) return; seen.add(key);
    const c=ctx.replace(/\s+\n/g,'\n').slice(0,500); out.push({file:name, section:sec.kind, section_title:`${sec.num}. ${sec.title}`, where, context:c, signal:judge(c),
      reasons:[...new Set([...(c.match(new RegExp(EMPH.source,'g'))||[]),...(c.match(new RegExp(PASS.source,'gi'))||[])])], professor_said: /교수님\)|교\)/.test(c)}); };
  blocks.forEach((b,j)=>{ const sec=secOf[j]; if(!sec) return;
    if(b.type==='image'){ const name=b.text?.match(/\(([^)]+)\)/)?.[1]||b.imageData?.filename||b.filename||`img@${j}`;
      const ctx=[blocks[j-1],blocks[j+1],blocks[j+2]].filter(x=>x&&x.type==='paragraph').map(x=>x.text).join('\n'); add(name,sec,ctx,'본문'); }
    if(b.type==='table'){ const cells=b.table.cells; cells.forEach((row,ri)=>row.forEach((cell,ci)=>{ for(const name of imgsIn(cell.text)){
        let ctx=noImg(cell.text); if(ctx.length<15){ ctx=[ctx,...row.filter((_,k)=>k!==ci).map(c=>noImg(c.text)), ...(cells[ri+1]||[]).map(c=>noImg(c.text)), ...(cells[ri-1]||[]).map(c=>noImg(c.text))].filter(Boolean).join('\n'); }
        add(name,sec,ctx,'표 칸'); } })); }
  });
  return out;
}
const files=fs.readdirSync(dir).filter(f=>/\.hwpx?$/.test(f)).sort(); const summary=[];
for(const f of files){
  const r=await parse(fs.readFileSync(path.join(dir,f)),{imageFormat:'webp'});
  const fm=fileMeta(f,r.blocks); const base=f.replace(/\.hwpx?$/,''), od=path.join(OUT,base);
  const { secs, secOf, hasSummary } = splitSections(r.blocks);
  const bank=[]; let group=null, gProf=null, gYear=null, lastProf=null, curSec=null;
  r.blocks.forEach((b,j)=>{ const s=secOf[j]; if(!s) return; if(s!==curSec){ curSec=s; group=null; gProf=null; gYear=null; lastProf=null; }
    if(s.kind!=='exam'&&s.kind!=='practice'&&!s.questionRows) return;  // 문항 표가 섞인 다른 장도 문항은 뽑는다
    if(b.type==='paragraph' && /^Part\s*\d/i.test(b.text)){ lastProf=null; }
    if(b.type==='paragraph' && b.text.length<80 && (/^[A-Z]\.\s?\S/.test(b.text) || /(20\d\d|\d\d)\s*년.*(문족|문제|평가)/.test(b.text) || /(자작|확인|예상)\s*문제/.test(b.text))){
      group=b.text.trim(); gYear=yr(group); const p=profIn(group); if(p){ gProf=p; lastProf=p; } else gProf=null; }
    if(b.type!=='table'||b.table.cols!==2||hdr(b)) return;
    for(const row of b.table.cells){ const q=question(row); if(!q) continue;
      const selfMade=/자작|예상|확인\s*문제/.test((group||'')+s.title+q.header);
      let profSrc='group', prof=gProf; if(!prof && lastProf){ prof=lastProf; profSrc='carried'; } if(!prof && (selfMade || gYear===2026)){ prof=fm.professor; profSrc='file'; }
      const qy=appearances(q.header)?.[0].year ?? yr(q.header) ?? gYear; if(!prof && fm.first_year && qy && qy>=fm.first_year){ prof=fm.professor; profSrc='first-year-rule'; } if(!prof){ prof=null; profSrc= /모름/.test(group||'')?'unknown':'unstated'; }
      const app=appearances(q.header);
      bank.push({ id:`${base.slice(0,8)}-${fm.period}-${String(bank.length+1).padStart(3,'0')}`, section:{num:s.num, title:s.title, kind:s.kind},
        meta:{ subject:fm.subject, lecture:fm.lecture, professor:prof, professor_source:profSrc, year: app?.[0].year ?? yr(q.header) ?? gYear ?? (selfMade?+fm.date.slice(0,4):null), exam: examIn(q.header)||examIn(group), source: selfMade?(/확인/.test((group||'')+s.title+q.header)?'lecture-check':'student-made'):'past-exam', group, appearances: app,
          flags:{ in_scope_this_year: /★/.test(q.header)?true:/✘|범위\s*밖/.test(q.header)?false:null, recalled:/복기/.test(q.header+(group||'')), uncertain:/불확실|추정/.test(q.header+(group||'')) } },
        ...q });
    }
  });
  let images=collectImages(r.blocks, secOf);
  // tag images that belong to questions
  const qImgs=new Map(bank.flatMap(q=>q.images.map(n=>[n,q.id]))); for(const im of images) if(qImgs.has(im.file)){ im.question_id=qImgs.get(im.file); im.signal='question'; }
  fs.writeFileSync(`${od}/문제은행.json`, JSON.stringify({source:f, document:fm, questions:bank},null,1));
  fs.writeFileSync(`${od}/그림목록.json`, JSON.stringify({source:f, images},null,1));
  const c=(a,k,v)=>a.filter(x=>x[k]===v).length;
  summary.push({lecture:fm.lecture, prof:fm.professor, q:bank.length, withYear:bank.filter(q=>q.meta.year).length, withProf:bank.filter(q=>q.meta.professor).length, profCarried:bank.filter(q=>q.meta.professor_source==='carried').length, dupLinked:bank.filter(q=>q.meta.appearances).length, imgs:images.length, emph:c(images,'signal','emphasized'), passed:c(images,'signal','passed'), mixed:c(images,'signal','mixed'), neutral:c(images,'signal','neutral'), inQ:c(images,'signal','question')});
}
console.table(summary); fs.writeFileSync(OUT+'/report-meta.json',JSON.stringify(summary,null,1));
