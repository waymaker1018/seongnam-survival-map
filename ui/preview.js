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
export function safeDownloadUrl(value) {
  try {
    const url=new URL(value);
    return url.protocol==='https:' && (url.hostname==='goesn.kr' || url.hostname.endsWith('.goesn.kr')) && !url.username && !url.password && url.pathname.startsWith('/upload/') ? url.href : '';
  } catch { return ''; }
}
function key(value) {
  const url=new URL(value);
  url.searchParams.delete('mi');url.searchParams.sort();url.hash='';
  return url.href;
}
export function attachmentFiles(post, index={}, service={}) {
  const files=[];
  for(const source of post.sources || []) {
    if(!safeUrl(source.url))continue;
    const entry=index[key(source.url)];
    for(const file of Array.isArray(entry?.files)?entry.files:[]) {
      const previewUrl=service.status==='unavailable' ? '' : safePreviewUrl(file.previewUrl);
      const downloadUrl=safeDownloadUrl(file.downloadUrl);
      if(!files.some(f=>f.name===file.name && f.previewUrl===previewUrl && f.downloadUrl===downloadUrl)) files.push({name:String(file.name || '첨부 문서'),previewUrl,downloadUrl});
    }
  }
  return files;
}
export function attachmentSection(post,index,service={}) {
  const files=attachmentFiles(post,index,service);
  const outage=service.status==='unavailable' ? `<p class="notice warn" role="status">${service.reason==='certificate_expired' ? '교육청 문서 미리보기 서버의 보안 인증서가 만료되어 미리보기를 일시 중단했습니다.' : '교육청 문서 미리보기 서버에 연결할 수 없어 미리보기를 일시 중단했습니다.'} 아래 원본 파일을 이용해 주세요.</p>` : '';
  return `<section class="attachments" aria-label="첨부파일 미리보기"><h4>첨부파일 미리보기</h4>${outage}${files.length ? files.map((file,i)=>`<div class="attachment"><span>${h(file.name)}</span><div class="attachment-actions">${file.previewUrl ? `<button class="preview-button" data-preview="${i}" aria-label="${h(file.name)} 미리보기">미리보기</button>` : ''}${file.downloadUrl ? `<a class="preview-button" href="${h(file.downloadUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${h(file.name)} 원본 파일 열기">원본 파일 열기 ↗</a>` : !file.previewUrl ? '<small>공고 원문에서 첨부파일을 확인해 주세요.</small>' : ''}</div></div>`).join('') : '<p>연결된 첨부파일이 없습니다. 아래 공고 원문에서 첨부파일을 확인해 주세요.</p>'}<p class="attachment-note">원본 파일은 교육청·학교에서 직접 제공합니다. 한글 문서는 내려받아 열고, PDF는 브라우저 설정에 따라 새 창에서 읽을 수 있습니다.</p></section>`;
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
