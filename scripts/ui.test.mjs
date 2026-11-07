import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { adaptData, dateOnly, loadData } from '../ui/data.js';
import { filteredPosts, statusOf, safeUrl, csvCell } from '../ui/core.js';
import { establishmentInfo } from '../ui/school-info.js';
import { schoolMetadata } from './collect_school_establishments.mjs';

const read = name => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url)));
test('별도 디지털튜터 자료도 실제 로더에서 읽고 학교·접수 종료·분야 필터에 반영한다', async t => {
  t.mock.method(globalThis,'fetch',async url=>({ok:true,json:async()=>read(String(url).split('/').pop().replace('.json',''))}));
  const data=await loadData(), tutors=read('seongnam_digital_tutor_2026');
  assert.deepEqual(data.loadErrors,[]);
  assert.equal(data.posts.find(p=>p.schoolName==='성일중학교').establishment,'사립');
  assert.equal(data.posts.find(p=>p.schoolNames?.length===19).establishment,'공립·사립 혼합');
  assert.ok(data.schools.every(s=>s.establishment==='공립'));
  const posts=filteredPosts(data.posts,data.schools,{category:'디지털튜터',year:'2026'});
  for(const row of tutors) {
    const post=posts.find(p=>p.sources.some(s=>s.url===row.sourceUrl));
    assert.ok(post,row.title);
    assert.equal(statusOf(post,'2026-11-08').key,'closed');
    assert.equal(post.startDate,row.applyStart.replaceAll('.','-'));
    const school=data.schools.find(s=>s.name===row.school);
    if(school)assert.equal(post.schoolId,school.id);
  }
  assert.equal(new Set(data.posts.map(p=>p.id)).size,data.posts.length);
  const row=tutors[0];
  const duplicate=adaptData(data.schools,[{id:'duplicate',title:row.title,sourceUrl:row.sourceUrl}],{items:[]},{items:[]},{},[row]);
  assert.equal(duplicate.posts.length,1);
  assert.equal(duplicate.posts[0].deadlineDate,row.applyEnd.replaceAll('.','-'));
});

test('설립 구분은 동일 지역의 정확한 학교만 사용하고 모호한 응답은 미확인으로 둔다', () => {
  const row={SCHUL_NM:'성일중학교',ATPT_OFCDC_SC_CODE:'J10',ORG_RDNMA:'경기도 성남시 중원구 시민로',FOND_SC_NM:'사립',SCHUL_KND_SC_NM:'중학교'};
  assert.equal(schoolMetadata([row],'성일중학교','https://open.neis.go.kr/','2026-11-08').establishment,'사립');
  assert.equal(schoolMetadata([{...row,ORG_RDNMA:'경기도 수원시'}],'성일중학교').establishment,null);
  assert.equal(schoolMetadata([row,row],'성일중학교').establishment,null);
  assert.equal(schoolMetadata([{...row,SCHUL_NM:'성일고등학교'}],'성일중학교').establishment,null);
  assert.equal(schoolMetadata([{...row,ORG_RDNMA:'경기 성남시 중원구'}],'성일중학교').establishment,'사립');
});
test('학교 ID·학교명·제목을 연결하고 통합 모집과 미확인을 구분한다', () => {
  const registry=[{name:'금상초등학교',establishment:'공립'},{name:'성일중학교',establishment:'사립'}];
  const schools=[{id:'gumsang',name:'금상초등학교'}];
  assert.equal(establishmentInfo({schoolId:'gumsang'},schools,registry).establishment,'공립');
  assert.equal(establishmentInfo({title:'(금상초) 강사 모집'},schools,registry).establishment,'공립');
  assert.equal(establishmentInfo({schoolName:'성일중학교'},schools,registry).establishment,'사립');
  assert.equal(establishmentInfo({title:'가짜금상초 강사 모집'},schools,registry).establishment,'설립 구분 미확인');
  assert.equal(establishmentInfo({schoolNames:['금상초등학교','성일중학교']},schools,registry).establishment,'공립·사립 혼합');
  assert.equal(establishmentInfo({schoolNames:['금상초등학교','미등록학교']},schools,registry).establishment,'설립 구분 미확인');
  assert.equal(establishmentInfo({schoolId:'gumsang'},schools,[]).establishment,'설립 구분 미확인');
});
test('기존 자료의 학교와 공고를 보존하고 전국 자료를 분리한다', () => {
  const schools=read('schools'), history=read('recruitments'), hits=read('school_notice_hits'), training=read('training_hits');
  const data=adaptData(schools,history,hits,training,read('meta'));
  assert.equal(data.schools.length, schools.length);
  assert.equal(data.training.length, training.items.length);
  assert.equal(new Set(data.posts.map(p=>p.id)).size,data.posts.length);
  for(const original of [...history,...hits.items]) assert.ok(data.posts.some(p=>p.sources.some(s=>s.url===safeUrl(original.sourceUrl||original.url))));
  assert.ok(data.schools.every(s=>s.address===schools.find(raw=>raw.id===s.id).fullAddress));
});
test('한국 날짜, 미확인 마감과 충돌한 접수일을 정확히 표시한다', () => {
  assert.equal(dateOnly('2026-11-06T15:00:00.000Z'),'2026-11-07');
  assert.equal(dateOnly('2026-11-07'),'2026-11-07');
  assert.equal(dateOnly('invalid'),null);
  assert.equal(statusOf({deadlineDate:null},'2026-11-07').key,'unknown');
  assert.equal(statusOf({deadlineDate:'2026-11-06'},'2026-11-07').key,'closed');
  assert.equal(statusOf({deadlineDate:'2026-11-07'},'2026-11-07').tone,'urgent');
  const history=[{id:'a',title:'강사 모집',sourceUrl:'https://school.test/read?nttSn=1&mi=1',deadlineDate:'2026-11-10'}];
  const hits={items:[{id:'b',title:'강사 모집',url:'https://school.test/read?mi=2&nttSn=1',deadline:'2026-11-11'}]};
  const data=adaptData([],history,hits,{items:[]},{});
  assert.equal(data.posts.length,1);
  assert.equal(data.posts[0].deadlineDate,null);
  assert.equal(data.posts[0].sources.length,2);
});
test('관심 학교·구·동·분야 필터와 마감 정렬을 함께 적용한다', () => {
  const schools=[{id:'a',district:'중원구',dong:'은행동'},{id:'b',district:'분당구',dong:'구미동'}];
  const posts=[{id:'a1',schoolId:'a',title:'늘봄 강사',year:2026,categories:['늘봄'],sources:[],deadlineDate:'2999-01-01'},
    {id:'b1',schoolId:'b',title:'늘봄 강사',year:2026,categories:['늘봄'],sources:[],deadlineDate:'2020-01-01'},
    {id:'a2',schoolId:'a',title:'AI 강사',year:2026,categories:['디지털·AI'],sources:[],deadlineDate:null}];
  assert.deepEqual(filteredPosts(posts,schools,{district:'중원구',dong:'은행동',year:'2026',category:'늘봄',favoriteSchools:['a']}).map(p=>p.id),['a1']);
  assert.equal(filteredPosts(posts,schools,{favoriteSchools:[]}).length,0);
  assert.equal(filteredPosts(posts,schools,{saved:true},['a2']).length,1);
  assert.equal(filteredPosts(posts,schools,{query:'은행동'}).length,2);
  assert.deepEqual(filteredPosts(posts,schools,{sort:'deadline'}).map(p=>p.id),['a1','a2','b1']);
  assert.equal(safeUrl('javascript:alert(1)'),'');
  assert.equal(csvCell('=1+2'),'"\'=1+2"');
});
