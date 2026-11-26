// 강조 조각 다듬기 (convert 가 쓴다)
// 잡음(응원·인사·기호뿐) 거르고, 같은 장의 같은 글은 한 번만 (높은 level 을 남긴다)
export const NOISE=/화이팅|파이팅|홧팅|fighting|수고\s*(하|했|많)|고생\s*(하|했|많)|감사합니다|사랑합니다|힘내|합격\s*기원|ㅋㅋ|ㅎㅎ|ㅠㅠ/i;
export function tidyEmph(items){ const best=new Map();
  for(const e of items){ const core=e.text.replace(/[王★☆※*\s\-.,:;!?()\[\]<>~·•|/]/g,'');
    if(core.length<2 || NOISE.test(e.text)) continue;
    const k=e.section+'|'+e.text; const o=best.get(k); if(!o||e.level>o.level) best.set(k,e); }
  return [...best.values()]; }
