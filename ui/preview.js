import { escapeHtml as h, safeUrl } from './core.js';

export function safePreviewUrl(value) {
  try {
    const url=new URL(value);
    return url.origin==='https://ub01.viewstory.net' && !url.username && !url.password && url.pathname.startsWith('/external/resources/upload/') && /\.(html|pdf)$/i.test(url.pathname) ? url.href : '';
  } catch { return ''; }
}
export function previewFrameUrl(value) {
  const safe=safePreviewUrl(value);
  if(!safe)return '';
  const file=new URL(safe);
  if(!file.pathname.toLowerCase().endsWith('.pdf'))return safe;
  // 공식 뷰어와 동일한 PDF.js 화면을 사용해 모바일과 sandbox에서도 표시한다.
  const viewer=new URL('/resources/common/lib/pdf.js_2.0/web/viewer.html',file.origin);
  viewer.searchParams.set('file',file.pathname);
  viewer.hash='zoom=page-width';
  return viewer.href;
}
function key(value) {
  const url=new URL(value);
  url.searchParams.delete('mi');url.searchParams.sort();url.hash='';
  return url.href;
}
export function attachmentFiles(post, index={}) {
  const files=[];
  for(const source of post.sources || []) {
    if(!safeUrl(source.url))continue;
    const entry=index[key(source.url)];
    for(const file of Array.isArray(entry?.files)?entry.files:[]) {
      const previewUrl=safePreviewUrl(file.previewUrl);
      if(!files.some(f=>f.name===file.name && f.previewUrl===previewUrl)) files.push({name:String(file.name || '첨부 문서'),previewUrl});
    }
  }
  return files;
}
export function attachmentSection(post,index) {
  const files=attachmentFiles(post,index);
  return `<section class="attachments" aria-label="첨부파일 미리보기"><h4>첨부파일 미리보기</h4>${files.length ? files.map((file,i)=>`<div class="attachment"><span>${h(file.name)}</span>${file.previewUrl ? `<button class="preview-button" data-preview="${i}" aria-label="${h(file.name)} 미리보기">미리보기</button>` : '<small>원문에서 확인해 주세요.</small>'}</div>`).join('') : '<p>연결된 미리보기가 없습니다. 공고 원문의 첨부파일 미리보기를 이용해 주세요.</p>'}<p class="attachment-note">공식 문서 뷰어를 연결합니다. 파일을 내려받지 않고 읽을 수 있습니다.</p></section>`;
}
export function openAttachment(file,sourceUrl) {
  const url=previewFrameUrl(file?.previewUrl);
  if(!url)return;
  const dialog=document.getElementById('previewDialog');
  document.getElementById('previewTitle').textContent=file.name;
  const frame=document.getElementById('previewFrame');
  frame.title=`첨부파일: ${file.name}`;
  frame.src=url;
  document.getElementById('previewNewTab').href=url;
  document.getElementById('previewOriginal').href=safeUrl(sourceUrl) || './';
  dialog.showModal();
  document.getElementById('previewClose').focus();
}
export function setupPreview() {
  const dialog=document.getElementById('previewDialog');
  document.getElementById('previewClose').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  dialog.addEventListener('close',()=>document.getElementById('previewFrame').removeAttribute('src'));
}
