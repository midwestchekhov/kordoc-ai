import fs from 'fs'; import path from 'path';
const OUT=process.argv[2]; const rep=[];
const norm=s=>(s||'').replace(/!\[[^\]]*\]\([^)]*\)/g,'').replace(/[①-⑤\s\d.,()\-:·/]/g,'').toLowerCase();
const grams=s=>{const g=new Set(); for(let i=0;i<s.length-2;i++) g.add(s.slice(i,i+3)); return g;};
const jac=(a,b)=>{let n=0; for(const x of a) if(b.has(x)) n++; return n/(a.size+b.size-n||1);};
for(const d of fs.readdirSync(OUT)){ const p=path.join(OUT,d,'문제은행.json'); if(!fs.existsSync(p)) continue;
  const j=JSON.parse(fs.readFileSync(p)); const Q=j.questions; const G=Q.map(q=>grams(norm(q.stem+' '+q.choices.join(' '))));
  const parent=Q.map((_,i)=>i); const f=i=>parent[i]===i?i:(parent[i]=f(parent[i]));
  for(let a=0;a<Q.length;a++) for(let b=a+1;b<Q.length;b++){ const s=jac(G[a],G[b]); if(s>=0.45) parent[f(b)]=f(a); }
  const groups={}; Q.forEach((q,i)=>(groups[f(i)]??=[]).push(q));
  const clusters=Object.values(groups).filter(g=>g.length>1).map((g,k)=>({cluster_id:`c${k+1}`, size:g.length, years:[...new Set(g.flatMap(q=>q.meta.appearances?q.meta.appearances.map(a=>a.year):[q.meta.year]))].filter(Boolean).sort(), answers:[...new Set(g.map(q=>q.answer))], sample:g[0].stem.slice(0,90), ids:g.map(q=>q.id)}));
  for(const c of clusters) for(const id of c.ids) Q.find(q=>q.id===id).meta.cluster_id=c.cluster_id;
  // recurrence count includes explicit "=" appearances
  for(const q of Q){ const c=clusters.find(c=>c.cluster_id===q.meta.cluster_id); q.meta.times_seen = Math.max(c?c.years.length:1, q.meta.appearances?.length||1); }
  // LLM slots to fill later
  for(const q of Q) q.analysis={ topic:null, tested_point:null, testable_conditions:[], discriminators:[], distractor_notes:[], difficulty:null, filled_by:null };
  j.recurrence=clusters.sort((a,b)=>b.years.length-a.years.length);
  fs.writeFileSync(p, JSON.stringify(j,null,1));
  rep.push({file:d.slice(0,30), q:Q.length, clusters:clusters.length, inClusters:clusters.reduce((a,c)=>a+c.size,0), seen3plus:Q.filter(q=>q.meta.times_seen>=3).length, top: clusters[0]? `${clusters[0].years.join(',')} :: ${clusters[0].sample.slice(0,40)}`:''});
}
console.table(rep);
