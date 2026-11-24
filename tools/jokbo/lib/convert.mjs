// 족보 HWPX/HWP → 구성.json·머리말·급분바·문족·본문·전체 .md (+ 강조.json, images/*.webp). 파싱은 늘 전부, 무엇을 먼저 읽을지는 구성.json read_order
import { parse, blocksToMarkdown } from 'kordoc'; import JSZip from 'jszip'; import sharp from 'sharp';
import fs from 'fs'; import path from 'path';
const OUT=process.argv[2], INPUTS=process.argv.slice(3);
const files=INPUTS.flatMap(d=>fs.statSync(d).isDirectory()?fs.readdirSync(d).filter(f=>/\.hwpx?$/i.test(f)).sort().map(f=>path.join(d,f)):[d]);

// ---------- sections (lib/sections.mjs)
import { splitSections, KIND_KO, isQuestionRow, hdr } from './sections.mjs';
import { tidyEmph } from './emphasis.mjs';
import { tableList, emphSummary } from './extras.mjs';

// ---------- box-table unwrapping
const IMGRE=/!\[[^\]]*\]\([^)]+\)/g;
const cellBlocks=c=> c.blocks?.length ? c.blocks : (c.text||'').split('\n').filter(s=>s.trim()).map(t=>({type:'paragraph',text:t}));
const isImgCell=c=>{ const bs=cellBlocks(c); return bs.length>0 && bs.every(b=>b.type==='image' || (b.type==='paragraph' && !(b.text||'').replace(IMGRE,'').trim())); };
const isBlank=c=>!(c.text||'').trim() && !(c.blocks||[]).some(b=>b.type==='image');
const isTiny=c=>!(c.blocks||[]).some(b=>b.type==='image') && (c.text||'').trim().length<=3;
function unwrap(blocks){ const out=[];
  for(const b of blocks){ if(b.type!=='table'){ out.push(b); continue; }
    const t=b.table, cells=t.cells.flat();
    if(t.cols===1){ t.cells.forEach((row,ri)=>{ const c=row[0]; if(!c) return; const bs=cellBlocks(c);
        if(ri===0&&t.rows>1&&bs.length===1&&bs[0].type==='paragraph'&&(bs[0].text||'').length<=80&&!/!\[/.test(bs[0].text||'')) out.push({...bs[0],type:'heading',level:4});
        else out.push(...unwrap(bs)); }); continue; }
    if(cells.some(isImgCell)&&cells.every(c=>isImgCell(c)||isTiny(c)||isBlank(c))){ for(const c of cells) if(isImgCell(c)) out.push(...cellBlocks(c)); continue; }
    if(t.cols===2&&t.cells.every(r=>r.length===2&&(isImgCell(r[0])!==isImgCell(r[1])||r.every(isBlank)))){ for(const r of t.cells){ const [im,tx]=isImgCell(r[0])?r:[r[1],r[0]]; out.push(...cellBlocks(im),...unwrap(cellBlocks(tx))); } continue; }
    out.push(b); }
  return out; }

// ---------- colours from HWPX XML
const hex=c=>{ const m=/^#?([0-9a-f]{6})$/i.exec(c||''); if(!m) return null; const n=parseInt(m[1],16); return [n>>16,(n>>8)&255,n&255]; };
const colorClass=c=>{ const v=hex(c); if(!v) return null; const [r,g,b]=v;
  if(r>=150&&g<=110&&b<=110) return 'red';
  if(Math.max(r,g,b)-Math.min(r,g,b)<=12 && r>=0x5A && r<=0xC8) return 'gray'; return null; };
const unesc=s=>s.replace(/<[^>]+>/g,'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
async function readStyles(hwpxBytes){
  const zip=await JSZip.loadAsync(hwpxBytes);
  const header=await zip.file('Contents/header.xml').async('string');
  const cp={}; for(const m of header.matchAll(/<hh:charPr\b([^>]*)>([\s\S]*?)<\/hh:charPr>/g)){ const id=/\bid="(\d+)"/.exec(m[1])[1]; cp[id]={color:colorClass(/textColor="([^"]+)"/.exec(m[1])?.[1]), bold:/<hh:bold\b/.test(m[2])}; }
  const names=Object.keys(zip.files).filter(n=>/^Contents\/section\d+\.xml$/.test(n)).sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0]);
  const paras=[]; let seq=0;
  for(const n of names){ const x=await zip.file(n).async('string');
    const pst=[], rst=[]; let mark=false;
    for(const m of x.matchAll(/<hp:p\b[^>]*?(\/?)>|<\/hp:p>|<hp:run\b[^>]*charPrIDRef="(\d+)"[^>]*?(\/?)>|<\/hp:run>|<hp:markpenBegin\b[^>]*>|<hp:markpenEnd\b[^>]*>|<hp:t\b[^>]*?(?:\/>|>([\s\S]*?)<\/hp:t>)/g)){
      const tok=m[0];
      if(tok.startsWith('<hp:p ')||tok==='<hp:p>'){ if(!m[1]){ pst.push({i:seq++,runs:[]}); } }
      else if(tok==='</hp:p>'){ const p=pst.pop(); if(p) paras.push(p); }
      else if(tok.startsWith('<hp:run')){ if(!m[3]) rst.push(m[2]); }
      else if(tok==='</hp:run>') rst.pop();
      else if(tok.startsWith('<hp:markpenBegin')) mark=true;
      else if(tok.startsWith('<hp:markpenEnd')) mark=false;
      else if(tok.startsWith('<hp:t')){ const t=unesc(m[4]||''); if(!t||!pst.length) continue; const s=cp[rst.at(-1)]||{};
        pst.at(-1).runs.push({t, color:s.color, bold:!!s.bold, hl:mark}); }
    } }
  paras.sort((a,b)=>a.i-b.i);
  return paras.map(p=>{ const segs=[]; for(const r of p.runs){ const cls=r.hl?'hl':r.color||null; const last=segs.at(-1);
      if(last&&last.cls===cls&&last.bold===r.bold) last.t+=r.t; else segs.push({t:r.t,cls,bold:r.bold}); }
    const all=segs.map(s=>s.t).join(''), grayLen=segs.filter(s=>s.cls==='gray').reduce((a,s)=>a+s.t.trim().length,0);
    return {text:all, segs, grayRatio: all.trim()? grayLen/all.replace(/\s/g,'').length : 0}; });
}

// ---------- apply marks onto kordoc blocks
const OPEN={red:'',hl:'',gray:''}, CLOSE={red:'',hl:'',gray:''};
function holders(blocks, top, acc=[]){ blocks.forEach((b,j)=>{ const t=top??j;
  if(b.type==='table'){ for(const row of b.table.cells) for(const c of row){ if(c.blocks?.length) holders(c.blocks,t,acc); else acc.push({o:c,top:t}); } }
  else if(b.spans?.length) for(const s of b.spans) acc.push({o:s,top:t,block:b});
  else if(typeof b.text==='string') acc.push({o:b,top:t,block:b});
  if(b.children) holders(b.children,t,acc); }); return acc; }
const clean=t=>(t||'').replace(/[\uE000-\uF8FF]/g,'').replace(/\s+/g,' ').trim();
// 王 을 빼면 남는 게 번호·기호뿐인 조각 ("王王王", "Q1. 王")
const thin=t=>(t.replace(/王/g,'').replace(/^\s*[\dA-Za-z]{0,3}[.)]\s*/,'').match(/[가-힣A-Za-z]/g)||[]).length<2;
const ASIDE_RE=/^\s*(\d{2})?\s*(족|족원|족장|족보)(\s*부연)?\s*\)/;
function applyMarks(blocks, paras, secOf){
  const H=holders(blocks); let hi=0, hoff=0, hit=0, miss=0; const emph=[];
  const want=[]; for(const p of paras) for(const s of p.segs){ const t=s.t.trim(); if(t.length<2) continue; if(s.cls||s.bold) want.push({...s,t}); }
  for(const s of want){ let found=false;
    for(let h=hi; h<Math.min(H.length,hi+60); h++){ const o=H[h].o, txt=o.text||''; const at=txt.indexOf(s.t, h===hi?hoff:0); if(at<0) continue;
      if(s.cls){ o.text=txt.slice(0,at)+OPEN[s.cls]+s.t+CLOSE[s.cls]+txt.slice(at+s.t.length); }
      hi=h; hoff=at+s.t.length+(s.cls?2:0); found=true;
      const sec=secOf[H[h].top]; const king=/王/.test(s.t);
      const level=king?3:(s.cls==='red'||s.cls==='hl')?2:s.cls==='gray'?0:1;
      let text=clean(s.t), scope='fragment';
      // 王만 있는 조각("王王王")은 그 문단(칸) 글 전체를 강조 내용으로
      if(king && thin(text)){ text=clean(H[h].o.text).replace(/王/g,'').trim().slice(0,400); scope='paragraph'; }
      emph.push({section:sec?`${sec.num}. ${sec.title}`:'머리말', kind:sec?.kind||'prelude', text, level, scope, top:H[h].top, sources:[king&&'王',s.bold&&'bold',s.cls==='red'&&'red',s.cls==='hl'&&'highlight'].filter(Boolean), aside:s.cls==='gray'});
      break; }
    if(found) { if(s.cls) hit++; } else if(s.cls) miss++; }
  // 王…王 in plain text
  for(const h of H){ for(const m of (h.o.text||'').matchAll(/王([^王\n]{1,200})王/g)){ const sec=secOf[h.top]; const t=clean(m[1]); if(t.length>=2) emph.push({section:sec?`${sec.num}. ${sec.title}`:'머리말', kind:sec?.kind||'prelude', text:t, level:3, scope:'fragment', top:h.top, sources:['王'], aside:false}); } }
  // whole-paragraph asides at top level → quote
  const grayParas=new Set(paras.filter(p=>p.grayRatio>=0.6).map(p=>p.text.trim()));
  for(const b of blocks) if(b.type==='paragraph'){ const plain=(b.spans?b.spans.map(s=>s.text).join(''):b.text||'').replace(/[-]/g,'').trim();
    if(plain && (grayParas.has(plain) || ASIDE_RE.test(plain))){ b.quote=true; const tgt=b.spans?.[0]||b; tgt.text='[곁말] '+(tgt.text||'').replace(/^/,'').replace(/$/,''); } }
  return {hit,miss,emph:tidyEmph(emph)};
}

const finishMd=md=>md.replace(//g,'<r>').replace(//g,'</r>').replace(//g,'==').replace(//g,'==').replace(//g,'<g>').replace(//g,'</g>')
  .replace(/<r>(\s*)<\/r>|<g>(\s*)<\/g>|==(\s*)==/g,'$1$2$3');

// ---------- main
let rhwp=null; async function toHwpx(bytes){ if(!rhwp){ rhwp=await import(new URL('../node_modules/@rhwp/core/rhwp.js', import.meta.url)); await rhwp.default({module_or_path:fs.readFileSync(new URL('../node_modules/@rhwp/core/rhwp_bg.wasm', import.meta.url))}); } const d=new rhwp.HwpDocument(new Uint8Array(bytes)); const x=d.exportHwpx(); d.free?.(); return x; }
const rep=[];
for(const fp of files){
  const t0=Date.now(); const buf=fs.readFileSync(fp); const isHwp=/\.hwp$/i.test(fp);
  const r=await parse(buf,{});
  const paras=await readStyles(isHwp? await toHwpx(buf) : buf);
  const base=path.basename(fp).normalize('NFC').replace(/\.hwpx?$/i,''), od=path.join(OUT,base);
  // sections
  const { secs, secOf, headerStyle, hasSummary } = splitSections(r.blocks);
  const {hit,miss,emph}=applyMarks(r.blocks, paras, secOf);
  const OUTS=[['머리말',['prelude']],['급분바',['summary']],['문족',['exam','practice']],['본문',['body']]];
  const keepKinds=new Set(OUTS.flatMap(o=>o[1]));
  const raw={}; for(const [name,kinds] of OUTS) raw[name]=secs.filter(s=>kinds.includes(s.kind)).map(s=>(s.kind==='prelude'?'':`## ${s.num}. ${s.title}\n\n`)+blocksToMarkdown(unwrap(s.blocks))).join('\n\n');
  // md 가 쓰는 그림만 (안 쓰는 그림은 버린다)
  const used=new Set(); const addRefs=t=>{ for(const m of (t||'').matchAll(/image_\d+\.[a-z]+/g)) used.add(m[0]); };
  Object.values(raw).forEach(addRefs); addRefs(r.markdown);
  // images
  try{ fs.rmSync(path.join(od,'images'),{recursive:true,force:true}); }catch{} fs.mkdirSync(path.join(od,'images'),{recursive:true});
  const rename={}; let a=0,b=0,kept=0;
  for(const im of r.images||[]){ a+=im.data.length; if(!used.has(im.filename)) continue; kept++; const nm=im.filename.replace(/\.[^.]+$/,'.webp'); let out;
    try{ out=await sharp(im.data).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).webp({quality:85}).toBuffer(); }catch{ out=null; }
    const name=out?nm:im.filename; fs.writeFileSync(path.join(od,'images',name), out||im.data); rename[im.filename]=name; b+=(out||im.data).length; }
  const fixImg=md=>md.replace(/image_\d+\.[a-z]+/g,m=>rename[m]||m.replace(/\.[a-z]+$/,'.webp'));
  for(const [name] of OUTS){ fs.writeFileSync(path.join(od,name+'.md'), finishMd(fixImg(raw[name]))); try{ fs.rmSync(path.join(od,name+'.원본표.md'),{force:true}); }catch{} }
  fs.writeFileSync(path.join(od,'전체.md'), finishMd(fixImg(r.markdown)));
  // 표 목록(병합 칸을 푼 Markdown 표)·강조요약(강조가 걸린 문단·표 전체와 그림)
  const fmt=t=>finishMd(fixImg(t)); const render=bs=>finishMd(fixImg(blocksToMarkdown(unwrap(bs)))).trim();
  const em=emph.filter(e=>keepKinds.has(e.kind));
  const tables=tableList({blocks:r.blocks, secOf, emph:em, unwrap, fmt});
  fs.writeFileSync(path.join(od,'표목록.json'), JSON.stringify({source:path.basename(fp).normalize('NFC'), tables:tables.map(({markdown,...t})=>t)},null,1));
  fs.writeFileSync(path.join(od,'표.md'), tables.map(t=>`### ${t.id} · ${t.section} · 강조 ${t.emphasis}${t.merged?' · 병합 풂':''}\n\n${t.markdown}`).join('\n\n')+'\n');
  fs.writeFileSync(path.join(od,'강조요약.json'), JSON.stringify({source:path.basename(fp).normalize('NFC'), note:'level 3 王 / 2 빨강·형광펜. context 는 강조가 걸린 문단·표 전체(제목꼴이면 그 아래 몇 블록까지). negative 는 "시험에 안 나옴" 같은 말', items:emphSummary({blocks:r.blocks, secOf, emph:em, unwrap, render, fmt})},null,1));
  const imgsOf=s=>{ const set=new Set(); for(const blk of s.blocks) for(const m of JSON.stringify(blk.table?blk.table.cells.map(r=>r.map(c=>c.text)):blk.text||'').matchAll(/image_\d+\.[a-z]+/g)) set.add(m[0]); for(const blk of s.blocks) if(blk.type==='image') set.add('?'); return set.size; };
  fs.writeFileSync(path.join(od,'구성.json'), JSON.stringify({source:path.basename(fp).normalize('NFC'), header_style:headerStyle, has_summary:hasSummary,
    // 먼저 읽을 것: 급분바가 잡히면 급분바·문족, 안 잡히면(fallback) 본문·문족. 본문은 필요할 때만
    read_order: hasSummary? ['급분바.md','문족.md','본문.md'] : ['본문.md','문족.md'], fallback: !hasSummary,
    sections:secs.map(s=>({num:s.num, title:s.title, kind:s.kind, kind_ko:KIND_KO[s.kind], decided_by:s.reason, chars:blocksToMarkdown(s.blocks).length, question_rows:s.questionRows, images:imgsOf(s), output: OUTS.find(o=>o[1].includes(s.kind))?.[0]??null}))},null,1));
  fs.writeFileSync(path.join(od,'강조.json'), JSON.stringify({source:path.basename(fp), legend:{3:'王',2:'빨강·형광펜',1:'굵게',0:'곁말(회색)'}, items:emph.filter(e=>keepKinds.has(e.kind)).map(({top,...e})=>e)},null,1));
  const lv=l=>emph.filter(e=>e.level===l&&keepKinds.has(e.kind)).length;
  rep.push({file:base.slice(0,24), kinds:secs.slice(1).map(s=>s.kind[0]+(s.reason==='content'?'*':'')).join(''), summary:hasSummary, colorHit:`${hit}/${hit+miss}`, 王:lv(3), red_hl:lv(2), imgs:`${kept}/${(r.images||[]).length}`, imgMB:`${(a/1e6).toFixed(1)}→${(b/1e6).toFixed(1)}`, s:((Date.now()-t0)/1000).toFixed(0)});
}
console.table(rep);
