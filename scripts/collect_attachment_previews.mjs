import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const viewerOrigin = 'https://ub01.viewstory.net';
const decode = text => String(text).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&#x27;/gi,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>');
export function noticeKey(value) {
  const url = new URL(value);
  url.searchParams.delete('mi');
  url.searchParams.sort();
  url.hash = '';
  return url.href;
}
function schoolUrl(value) {
  try { const u=new URL(value); return u.protocol==='https:' && (u.hostname==='goesn.kr' || u.hostname.endsWith('.goesn.kr')) && !u.username && !u.password; } catch { return false; }
}
export function parseAttachments(html) {
  const files = [];
  for (const match of html.matchAll(/previewAjax\(\s*'([^']+)'\s*,\s*'([^']*)'\s*\)/g)) {
    const url=decode(match[1]), name=decode(match[2]);
    if(schoolUrl(url) && new URL(url).pathname.startsWith('/upload/') && !files.some(f=>f.url===url)) files.push({name,url});
  }
  return files;
}
export function viewerRequest(html) {
  const fields=['cc','reqUrl','apikey','fileName','url','previewType','srcPath','srcFileCnt','uuid','type','base64Data','dataKey','urlEncodeType','viewType'];
  return Object.fromEntries(fields.map(name=>[name, html.match(new RegExp('var '+name+'\\s*=\\s*"([^"\\r\\n]*)"'))?.[1] || '']));
}
export function convertedUrl(html) {
  const error=html.match(/var ErrMessage\s*=\s*'([^']*)'/)?.[1];
  const result=html.match(/var resultKey\s*=\s*'([^']*)'/)?.[1];
  if(error || (result && result!=='0')) return '';
  const format=html.match(/var imageFormat\s*=\s*'([^']*)'/)?.[1];
  if(!['HTML','PDF'].includes(format)) return '';
  // 뷰어가 반환한 공개 문서 주소만 사용한다. 인증 값과 원문 본문은 저장하지 않는다.
  const path=html.match(/viewT\s*=\s*'(\/external\/resources\/upload\/[^']+\.(?:html|pdf))'/i)?.[1];
  if(!path) return '';
  const url=new URL(path,viewerOrigin);
  return url.origin===viewerOrigin && url.pathname.startsWith('/external/resources/upload/') ? url.href : '';
}
async function text(url, options={}) {
  const response=await fetch(url,{...options,signal:AbortSignal.timeout(25000)});
  if(!response.ok) throw Error(`HTTP ${response.status}`);
  return response.text();
}
async function convert(file, sourceHtml) {
  const key=sourceHtml.match(/var apiKey\s*=\s*"([^"]+)"/)?.[1];
  const cc=sourceHtml.match(/var cc\s*=\s*"([^"]+)"/)?.[1];
  if(!key || !cc) return '';
  const page=await text(viewerOrigin+'/previewAjax.do',{method:'POST',body:new URLSearchParams({url:file.url,fileName:file.name,apikey:key,cc})});
  const request=viewerRequest(page);
  if(!request.apikey || request.url!==file.url || request.cc!==cc) return '';
  const converted=await text(viewerOrigin+'/GetViewAjax.do',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(request)});
  return convertedUrl(converted);
}
export async function collectPreviews({all=false}={}) {
  const read=async name=>JSON.parse(await readFile(new URL(`data/${name}.json`,root),'utf8'));
  const hits=await read('school_notice_hits');
  // shortcut: 과거 모집 이력은 --all로 보충한다. 기본 갱신은 최근 탐색 공고에 집중한다.
  const records=all ? [...hits.items,...await read('recruitments')] : hits.items;
  const targets=[...new Set(records.map(p=>p.url||p.sourceUrl).filter(schoolUrl).map(noticeKey))];
  let previous={items:{}};
  try { previous=await read('attachment_previews'); } catch {}
  const items={...previous.items}, queue=[...targets];
  let done=0,ready=0;
  await Promise.all(Array.from({length:3},async()=>{
    while(queue.length) {
      const url=queue.shift(), old=items[url];
      // 저장된 뷰어 링크는 매일 재확인한다. 실패한 조회로 기존 링크를 성공 상태로 유지하지 않는다.
      if(old?.status==='ready' && Date.now()-Date.parse(old.checkedAt)<20*60*60*1000){done++;ready++;continue;}
      const entry={checkedAt:new Date().toISOString(),status:'failed',files:[]};
      try {
        const html=await text(url), files=parseAttachments(html);
        entry.status=files.length?'ready':'unavailable';
        for(const file of files) {
          let previewUrl='';
          try { previewUrl=await convert(file,html); } catch {}
          entry.files.push({name:file.name,previewUrl});
        }
        if(files.length && !entry.files.some(f=>f.previewUrl))entry.status='unavailable';
        if(entry.files.some(f=>f.previewUrl))ready++;
      } catch { entry.status='failed'; }
      items[url]=entry;done++;
      if(done%10===0)console.log(`Attachment previews: ${done}/${targets.length} notices checked`);
    }
  }));
  await writeFile(new URL('data/attachment_previews.json',root),JSON.stringify({generatedAt:new Date().toISOString(),items},null,2)+'\n');
  console.log(`Attachment previews: ${ready}/${targets.length} notices have a viewer link`);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  collectPreviews({all:process.argv.includes('--all')}).catch(error=>{console.error(error.message);process.exitCode=1;});
}
