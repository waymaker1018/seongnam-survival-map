import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAttachments, viewerRequest, convertedUrl, noticeKey, checkPreviewService } from './collect_attachment_previews.mjs';
import { safePreviewUrl, safeDownloadUrl, previewFrameUrl, attachmentFiles, attachmentSection } from '../ui/preview.js';

const preview='https://ub01.viewstory.net/external/resources/upload/goesn/convert/document.html/document.html';
test('인증서 만료와 연결 실패를 알리고 서버 복구 후 미리보기를 다시 허용한다',async t=>{
  const post={sources:[{url:'https://www.goesn.kr/read?nttSn=1'}]};
  const downloadUrl='https://www.goesn.kr/upload/document.hwp';
  const index={'https://www.goesn.kr/read?nttSn=1':{files:[{name:'공고.hwp',previewUrl:preview,downloadUrl}]}};
  const mock=t.mock.method(globalThis,'fetch',async()=>{throw new TypeError('fetch failed',{cause:{code:'CERT_HAS_EXPIRED'}});});
  const service=await checkPreviewService();
  assert.equal(service.reason,'certificate_expired');
  const markup=attachmentSection(post,index,service);
  assert.ok(markup.includes('보안 인증서가 만료'));
  assert.ok(markup.includes(downloadUrl));
  assert.ok(!markup.includes('data-preview='));
  assert.equal(attachmentFiles(post,index,service)[0].previewUrl,'');
  mock.mock.mockImplementation(async()=>{throw Error('connection failed');});
  assert.equal((await checkPreviewService()).reason,'connection_failed');
  mock.mock.mockImplementation(async()=>({ok:true,text:async()=>''}));
  assert.ok(attachmentSection(post,index,await checkPreviewService()).includes('data-preview='));
});
test('원본 파일 링크는 HTTPS 교육청 첨부파일 경로만 허용한다',()=>{
  assert.equal(safeDownloadUrl('https://school.goesn.kr/upload/a.pdf'),'https://school.goesn.kr/upload/a.pdf');
  for(const url of ['http://www.goesn.kr/upload/a.hwp','https://www.goesn.kr.evil.test/upload/a.hwp','https://www.goesn.kr/admin/a.hwp','https://user@www.goesn.kr/upload/a.hwp','javascript:alert(1)'])assert.equal(safeDownloadUrl(url),'');
});
test('공식 첨부파일만 추출하고 중복·다른 호스트를 제외한다',()=>{
  const html=`previewAjax('https://www.goesn.kr/upload/file.hwp','강사 &amp; 안내.hwp')
    previewAjax('https://www.goesn.kr/upload/file.hwp','강사 &amp; 안내.hwp')
    previewAjax('https://malicious.test/upload/file.hwp','다른 파일.hwp')
    previewAjax('https://www.goesn.kr/upload/second.pdf','지원서.pdf')`;
  assert.deepEqual(parseAttachments(html).map(f=>f.name),['강사 & 안내.hwp','지원서.pdf']);
  assert.equal(noticeKey('https://www.goesn.kr/read?mi=2&nttSn=1'),'https://www.goesn.kr/read?nttSn=1');
});
test('뷰어가 발급한 요청 정보를 사용하고 변환 실패를 표시 주소로 취급하지 않는다',()=>{
  const request=viewerRequest('var apikey = "issued-test-value"; var cc = "goesn"; var url = "https://www.goesn.kr/upload/a.hwp";');
  assert.equal(request.apikey,'issued-test-value');
  assert.equal(request.url,'https://www.goesn.kr/upload/a.hwp');
  const html=`var ErrMessage = ''; var resultKey = '0'; var imageFormat = 'HTML'; viewT = '/external/resources/upload/goesn/convert/document.html/document.html';`;
  assert.equal(convertedUrl(html),preview);
  assert.equal(convertedUrl(html.replace("ErrMessage = ''","ErrMessage = '변환 실패'")),'');
  assert.equal(convertedUrl(html.replace("resultKey = '0'","resultKey = '12'")),'');
  assert.equal(convertedUrl(html.replace("imageFormat = 'HTML'","imageFormat = 'PNG'")),'');
});
test('첨부파일 이름과 주소를 검증하고 미지원 상태에 원문 안내를 제공한다',()=>{
  for(const url of ['javascript:alert(1)','https://ub01.viewstory.net.evil.test/external/resources/upload/a.html','https://ub01.viewstory.net/admin/a.html','https://user@ub01.viewstory.net/external/resources/upload/a.html'])assert.equal(safePreviewUrl(url),'');
  const post={sources:[{url:'https://www.goesn.kr/read?nttSn=1&mi=3'}]};
  const index={'https://www.goesn.kr/read?nttSn=1':{files:[{name:'<img src=x onerror=alert(1)>.hwp',previewUrl:preview},{name:'지원 안 됨.zip',previewUrl:''}]}};
  assert.equal(attachmentFiles(post,index).length,2);
  const markup=attachmentSection(post,index);
  assert.ok(!markup.includes('<img'));
  assert.equal((markup.match(/data-preview=/g)||[]).length,1);
  assert.ok(attachmentSection(post,{}).includes('공고 원문'));
  const pdf=previewFrameUrl(preview.replaceAll('.html','.pdf'));
  assert.equal(new URL(pdf).pathname,'/resources/common/lib/pdf.js_2.0/web/viewer.html');
  assert.ok(new URL(pdf).searchParams.get('file').endsWith('.pdf'));
  assert.equal(previewFrameUrl('https://example.com/a.pdf'),'');
});
