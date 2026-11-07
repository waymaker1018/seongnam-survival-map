import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root=new URL('../data/',import.meta.url);
export function schoolMetadata(rows,name,sourceUrl,checkedAt) {
  const matches=rows.filter(r=>r.SCHUL_NM===name && r.ATPT_OFCDC_SC_CODE==='J10' && /^경기(?:도)? 성남시\s/.test(r.ORG_RDNMA || ''));
  const row=matches.length===1 ? matches[0] : null;
  return {name,establishment:row && ['국립','공립','사립'].includes(row.FOND_SC_NM) ? row.FOND_SC_NM : null,
    level:row?.SCHUL_KND_SC_NM || null,sourceUrl,checkedAt};
}
async function collect() {
  const read=async name=>JSON.parse(await readFile(new URL(name+'.json',root),'utf8'));
  const schools=await read('schools'), tutors=await read('seongnam_digital_tutor_2026');
  const names=[...new Set([...schools.map(s=>s.name),...tutors.flatMap(p=>p.schoolNames || [p.school])])].filter(n=>/학교$/.test(n));
  const queue=[...names], items=[];
  await Promise.all(Array.from({length:4},async()=>{
    while(queue.length) {
      const name=queue.shift();
      const url=new URL('https://open.neis.go.kr/hub/schoolInfo');
      url.search=new URLSearchParams({Type:'json',ATPT_OFCDC_SC_CODE:'J10',SCHUL_NM:name}).toString();
      const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
      if(!response.ok)throw Error(`${name}: HTTP ${response.status}`);
      const data=await response.json();
      const code=data.RESULT?.CODE || data.schoolInfo?.[0]?.head?.find(h=>h.RESULT)?.RESULT.CODE;
      if(!['INFO-000','INFO-200'].includes(code))throw Error(`${name}: ${code || 'Invalid response'}`);
      items.push(schoolMetadata(data.schoolInfo?.[1]?.row || [],name,url.href,new Date().toISOString()));
    }
  }));
  items.sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  await writeFile(new URL('school_establishments.json',root),JSON.stringify(items,null,2)+'\n');
  console.log(JSON.stringify({schools:items.length,verified:items.filter(s=>s.establishment).length,unknown:items.filter(s=>!s.establishment).map(s=>s.name)}));
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)collect().catch(error=>{console.error(error.message);process.exitCode=1;});
