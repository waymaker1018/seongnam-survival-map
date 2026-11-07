import { loadData } from './data.js';
import { CATEGORIES, DISTRICTS, statusOf, seoulDate, escapeHtml as h, safeUrl, filteredPosts, csvCell } from './core.js';
const $ = id => document.getElementById(id);
const state = { data: null, tab: 'jobs', selected: null, selectedSchool: null, limit: 30, filters: { query: '', category: '', district: '', dong: '', year: '', favoriteSchools: null, status: '', source: '', sort: 'recent', schoolId: '', saved: false }, favorites: [] };
let map, markers, boundaries, toastTimer;
let favoriteSchools = [];
try { const saved=JSON.parse(localStorage.getItem('survivalmap.favorites') || '[]'); if(Array.isArray(saved)) favoriteSchools=saved.filter(id=>typeof id==='string'); } catch {}
const allPosts = () => [...state.data.posts, ...state.data.training];
const postPool = () => state.filters.saved ? allPosts() : state.tab === 'training' ? state.data.training : state.data.posts;
const currentPosts = () => filteredPosts(postPool(),state.data.schools,state.filters,state.favorites);
try { const saved = JSON.parse(localStorage.getItem('seongnam-map-post-favorites') || '[]'); state.favorites = Array.isArray(saved) ? saved.filter(x => typeof x === 'string') : []; } catch { /* Storage can be unavailable in private browsing. */ }
const link = (url, label, cls = '') => safeUrl(url) ? `<a class="${h(cls)}" href="${h(safeUrl(url))}" target="_blank" rel="noopener noreferrer">${h(label)}</a>` : '';
const tag = value => `<span class="tag ${value === '디지털튜터' ? 'digital' : value === 'AI 코디네이터' ? 'ai' : ''}">${h(value)}</span>`;
const shortLevel = value => ({ 초등학교: '초등', 중학교: '중등', 고등학교: '고등' }[value] || value || '학교 확인');
const dateText = value => value ? (value.includes('T') ? seoulDate(new Date(value)) : value.slice(0, 10)).replaceAll('-', '.') : '미확인';
const schoolById = id => state.data.schools.find(s => s.id === id);
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').hidden = true, 3000); }
function setFilter(key, value) { if(key==='district')state.filters.dong=''; state.filters[key] = value; state.limit = 30; state.selected = null; render(); }
function stats() {
  const { schools, posts } = state.data;
  const open = posts.filter(p => statusOf(p).key === 'open').length;
  const urgent = posts.filter(p => statusOf(p).tone === 'urgent').length;
  const unknown = posts.filter(p => statusOf(p).key === 'unknown').length;
  $('stats').innerHTML = [
    ['접수기간 내', open, '건', '공고에 적힌 접수일 기준', 'open', true],
    ['마감 임박', urgent, '건', '오늘부터 3일 이내 마감', 'urgent'],
    ['수집한 모집 공고', posts.length, '건', `접수일 확인 필요 ${unknown}건 포함`, ''],
    ['성남 학교', schools.length, '개교', '공식 명부의 초등학교 · 휴교 포함', 'map']
  ].map(([label, count, unit, sub, filter, primary]) => `<button class="stat ${primary ? 'primary' : ''}" data-stat="${h(filter)}"><span class="stat-label">${label}</span><strong class="stat-number">${count.toLocaleString()}<span class="stat-unit">${unit}</span></strong><span class="stat-sub">${sub}</span><span class="stat-arrow" aria-hidden="true">↗</span></button>`).join('');
}
function renderFilters() {
  const f = state.filters;
  $('dong').innerHTML='<option value="">모든 동</option>'+[...new Set(state.data.schools.filter(s=>!f.district||s.district===f.district).map(s=>s.dong||'동 미상'))].sort((a,b)=>a.localeCompare(b,'ko')).map(d=>`<option>${h(d)}</option>`).join('');
  $('year').innerHTML='<option value="">전체 연도</option>'+[...new Set(postPool().map(p=>p.year).filter(Boolean))].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join('');
  $('source').innerHTML='<option value="">모든 출처</option>'+[...new Set(postPool().flatMap(p=>p.sources.map(s=>s.name)))].map(n=>`<option>${h(n)}</option>`).join('');
  $('schoolSavedCount').textContent=favoriteSchools.filter(id=>schoolById(id)).length;
  $('schoolSavedToggle').setAttribute('aria-pressed',String(!!f.favoriteSchools));
  ['district','dong','schoolSavedToggle'].forEach(id=>$(id).disabled=state.tab==='training');
  $('categoryFilters').innerHTML = ['', ...CATEGORIES].map((c,i) => `<button class="category-button ${f.category === c ? 'active' : ''}" data-category="${h(c)}" aria-pressed="${f.category === c}"><span class="category-icon" aria-hidden="true">${['▦','▱','☀','◇','✧','⌘','♫','▤'][i]}</span>${c || '전체 분야'}<span>${c ? postPool().filter(p => p.categories.includes(c)).length : postPool().length}</span></button>`).join('');
  ['district','dong','year','status','source','sort'].forEach(key => $(key).value = f[key]);
  $('savedToggle').setAttribute('aria-pressed', String(f.saved));
  $('savedCount').textContent = state.favorites.filter(id => allPosts().some(p => p.id === id)).length;
  const labels = { query: f.query ? `검색: ${f.query}` : '', category: f.category, district: f.district, dong: f.dong, year: f.year ? `${f.year}년` : '', favoriteSchools:f.favoriteSchools?'관심 학교':'', source: f.source, schoolId: schoolById(f.schoolId)?.name, saved: f.saved ? '관심 공고' : '', status: ({open:'접수기간 내',closed:'접수 종료',unknown:'접수일 확인',upcoming:'접수 예정',urgent:'마감 임박'})[f.status] };
  $('activeFilters').innerHTML = Object.entries(labels).filter(([,v]) => v).map(([key,value]) => `<button class="filter-chip" data-clear="${key}">${h(value)} ×</button>`).join('');
}
function card(p) {
  const school = schoolById(p.schoolId), status = statusOf(p);
  return `<article class="job-card ${state.selected === p.id ? 'selected' : ''}" data-card="${h(p.id)}"><button class="bookmark" data-save="${h(p.id)}" aria-label="${h(p.title)} 관심 공고 ${state.favorites.includes(p.id) ? '해제' : '저장'}" aria-pressed="${state.favorites.includes(p.id)}">${state.favorites.includes(p.id) ? '★' : '☆'}</button><div class="card-top"><span class="school-name">${h(p.schoolName || '기관 통합 모집')}<small>${h(school ? `${school.district} · ${shortLevel(school.level)}` : state.tab==='training' ? '전국 정보 · 대상 지역 확인' : '학교별 확인 필요')}</small></span></div><button class="job-title" data-post="${h(p.id)}" aria-controls="detail">${h(p.title)}</button><div class="tags">${p.categories.map(tag).join('')}<span class="tag source">${h(p.sources[0]?.name || '')}${p.sources.length > 1 ? ` 외 ${p.sources.length-1}` : ''}</span></div><div class="card-bottom"><span class="status ${status.tone}">${status.label}</span><span>${p.deadlineDate ? `마감 ${dateText(p.deadlineDate)}` : `게시 ${dateText(p.postedDate)}`}</span></div></article>`;
}
function detail(p) {
  if (!p) { $('detail').innerHTML = '<p class="detail-kicker">공고 상세</p><div class="empty"><strong>관심 있는 공고를<br>선택해 보세요.</strong>학교 정보와 접수기간,<br>공고 원문을 여기서 확인합니다.</div>'; return; }
  const school = schoolById(p.schoolId), status = statusOf(p);
  const query = encodeURIComponent(`${school?.address || '성남시'} ${p.schoolName || ''}`);
  $('detail').innerHTML = `<p class="detail-kicker">RECRUITMENT DETAIL</p><span class="status ${status.tone}">${status.label}</span><h3>${h(p.schoolName || '기관 통합 모집')}</h3><p class="detail-address">${h(school?.address || '원문에서 모집 대상 학교를 확인하세요.')}</p><p class="detail-title">${h(p.title)}</p><div class="tags">${p.categories.map(tag).join('')}</div><dl><div><dt>학교급</dt><dd>${h(school?.level || '원문 확인')}</dd></div><div><dt>게시일</dt><dd>${dateText(p.postedDate)}</dd></div><div><dt>접수 시작</dt><dd>${dateText(p.startDate)}</dd></div><div><dt>접수 마감</dt><dd>${p.deadlineDate ? `${dateText(p.deadlineDate)} · 시간은 원문 확인` : '원문에서 확인 필요'}</dd></div><div><dt>수집 확인</dt><dd>${dateText(p.checkedAt)}</dd></div></dl>${link(p.url,'모집 공고 원문 보기 ↗','primary-button')}<div class="detail-links">${school ? link(school.homepage,'학교 홈페이지 ↗') + link(`https://map.naver.com/p/search/${query}`,'네이버지도 ↗') : ''}</div>${p.sources.length > 1 ? '<p class="detail-note">같은 제목으로 확인한 다른 출처</p>' + p.sources.slice(1).map(s => link(s.url, `${s.name} ↗`, 'secondary-source')).join('') : ''}<p class="detail-note">채용 인원, 자격요건, 제출 서류와 접수 마감 시각은 원문 및 첨부파일에서 확인해 주세요. 일정이 없는 공고는 모집 중 여부를 확정하지 않았습니다.</p>${school ? `<button class="outline school-save" data-school-save="${h(school.id)}" aria-pressed="${favoriteSchools.includes(school.id)}">${favoriteSchools.includes(school.id)?'★ 관심 학교':'☆ 관심 학교 저장'}</button><button class="text-button" style="margin-top:14px" data-school-jobs="${h(school.id)}">이 학교의 모집 이력 모아 보기 →</button>` : ''}`;
}
function renderJobs(posts) {
  if (!posts.some(p => p.id === state.selected)) state.selected = posts[0]?.id || null;
  $('jobList').innerHTML = posts.length ? posts.slice(0,state.limit).map(card).join('') + (posts.length > state.limit ? `<button class="load-more" id="loadMore">공고 더 보기 (${Math.min(state.limit,posts.length)} / ${posts.length}) ↓</button>` : '') : `<div class="empty"><strong>${state.filters.saved ? '저장한 공고가 없습니다.' : '조건에 맞는 공고가 없습니다.'}</strong>${state.filters.status === 'open' || state.filters.status === 'urgent' ? '접수일이 확인되지 않은 공고는 포함하지 않습니다.<br>' : ''}필터를 바꾸거나 학교 한눈맵에서<br>학교별 게시판을 직접 확인해 보세요.<br><button class="text-button" data-reset>필터 초기화</button></div>`;
  detail(posts.find(p => p.id === state.selected));
}
function relevantSchools(posts) {
  const f = state.filters, ids = new Set(posts.map(p => p.schoolId));
  return state.data.schools.filter(s => (!f.district || s.district === f.district) && (!f.dong || (s.dong||'동 미상') === f.dong) && (!f.favoriteSchools || f.favoriteSchools.includes(s.id))
    && (!f.schoolId || s.id === f.schoolId) && (!f.query || `${s.name} ${s.address} ${s.dong || ''}`.toLowerCase().includes(f.query.trim().toLowerCase()) || ids.has(s.id)));
}

function showSchool(id, scroll = false) {
  state.selectedSchool=id;
  const school=schoolById(id); if(!school)return;
  const posts=state.data.posts.filter(p=>p.schoolId===id), query=encodeURIComponent(school.address+' '+school.name);
  const boards=[...new Map(state.data.hits.items.filter(p=>p.schoolId===id&&p.boardUrl).map(p=>[p.boardUrl,p])).values()];
  $('schoolPreview').innerHTML=`<section class="school-preview"><div class="school-heading"><h3>${h(school.name)}</h3><button class="outline" data-school-save="${h(id)}" aria-pressed="${favoriteSchools.includes(id)}">${favoriteSchools.includes(id)?'★ 관심 학교':'☆ 관심 학교 저장'}</button></div><p>${h(school.level)} · ${h(school.district)} · ${h(school.dong || '동 미상')} · ${h(school.status || '')}</p><p>${h(school.address)}</p><p>전화 ${h(school.phone || '미확인')} · 팩스 ${h(school.fax || '미확인')} · 수집한 공고 ${posts.length}건</p>${school.geoApprox || school.dongApprox ? '<p class="detail-note">위치·동 정보는 근사값입니다. 실제 위치를 지도 링크에서 확인하세요.</p>' : ''}<div class="detail-links">${link(school.homepage,'학교 홈페이지 ↗')}${link('https://map.naver.com/p/search/'+query,'네이버지도 ↗')}${link(school.kakaoMapUrl,'카카오맵 ↗')}</div>${boards.map(b=>link(b.boardUrl,b.boardLabel+' ↗','secondary-source')).join('')}<button class="primary-button" data-school-jobs="${h(id)}">이 학교의 모집 이력 보기 →</button></section>`;
  if(scroll)$('schoolPreview').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function renderMap(posts) {
  const schools = relevantSchools(posts), counts = new Map();
  $('mapBreadcrumb').innerHTML='<button data-map-reset>성남 전체</button>'+ (state.filters.district?`<span>›</span><button data-map-district>${h(state.filters.district)}</button>`:'')+(state.filters.dong?`<span>› ${h(state.filters.dong)}</span>`:'');
  posts.forEach(p => counts.set(p.schoolId, (counts.get(p.schoolId)||0)+1));
  $('mapSummary').textContent = `${schools.length}개교 · 지도와 아래 학교 목록에 같은 필터가 적용됩니다.`;
  $('schoolGrid').innerHTML = `<div class="district-grid">${DISTRICTS.map(d => { const list = schools.filter(s => s.district === d); return `<section class="district-block"><div class="district-heading"><h3>${d}</h3><span>${list.length}개교</span></div><div class="school-grid">${list.map(s => `<button class="school-tile ${counts.get(s.id) ? 'has-posts' : ''}" data-school="${h(s.id)}"><strong>${h(s.name)}</strong><small>${h(s.dong||'동 미상')}${favoriteSchools.includes(s.id)?' · ★':''} · <span class="tile-count">${counts.get(s.id) || 0}건</span></small></button>`).join('') || '<p class="detail-note">조건에 맞는 학교가 없습니다.</p>'}</div></section>`; }).join('')}</div>`;
  if (!window.L) { $('geoMap').innerHTML = '<p class="empty">지도를 불러오지 못했습니다. 아래 학교 목록을 이용해 주세요.</p>'; return; }
  if (!map) {
    map = L.map('geoMap', {scrollWheelZoom:false}).setView([37.42,127.125],12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'}).on('tileerror',()=> $('tileWarning').hidden = false).addTo(map);
    markers = L.layerGroup().addTo(map);
    fetch('./data/boundaries_seongnam.json').then(r=>r.ok?r.json():null).then(data=>{if(!data)return;boundaries=L.geoJSON(data,{style:{color:'#205c49',weight:1.2,fillOpacity:0.025},onEachFeature:(feature,layer)=>{const district=String(feature.properties?.name||'').replace(/^.*?시(?=.+구$)/,'');if(DISTRICTS.includes(district)){layer.bindTooltip(district);layer.on('click',()=>setFilter('district',district));}}}).addTo(map);boundaries.bringToBack();}).catch(()=>{});
  }
  markers.clearLayers();
  const points = [];
  for (const s of schools) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    const count = counts.get(s.id)||0;
    const marker = L.marker([s.lat,s.lng],{title:`${s.name}, 공고 ${count}건`,alt:s.name,icon:L.divIcon({className:'school-pin',html:`<span class="pin ${count ? 'has-posts' : ''}">${count || '·'}</span>`,iconSize:[25,25],iconAnchor:[12,12]})});
    marker.bindTooltip(`${h(s.name)} · ${count}건`).on('click',()=>showSchool(s.id,true)).addTo(markers);
    points.push([s.lat,s.lng]);
  }
  requestAnimationFrame(()=>{map.invalidateSize();if(points.length) map.fitBounds(points,{padding:[25,25],maxZoom:14});});
  if (state.selectedSchool && schools.some(s=>s.id===state.selectedSchool)) showSchool(state.selectedSchool); else $('schoolPreview').innerHTML = '';
}
function renderCoverage() {
  const data=state.data, hits=data.hits, meta=data.meta;
  $('coverageView').innerHTML=`<div class="source-card"><h3>출처와 수집 범위</h3><p>기존 자동 수집 파일을 그대로 읽어 표시합니다. 최근 게시판 탐색 결과와 과거 모집 이력을 함께 볼 수 있습니다. 같은 원문 주소는 묶고, 다른 원문 주소는 각각 표시합니다. 제목의 키워드로 찾은 자료에는 채용과 무관한 안내도 포함될 수 있습니다.</p><p>학교별 성공·실패 내역은 현재 수집 파일에 없습니다. 공고가 없다는 이유만으로 해당 학교의 조회에 성공했다고 판단하지 않습니다.</p></div><div class="coverage-summary"><span>학교 명부 ${data.schools.length}개교</span><span>최근 탐색 대상 ${hits.schoolCount ?? '미확인'}개교</span><span>최근 발견 ${hits.items.length}건</span><span>모집 이력 ${data.posts.length}건</span></div><div class="source-card"><h3>성남교육지원청 · 학교 게시판</h3><p>최근 탐색 결과: ${dateText(meta.collectedDate)} · 최근 ${hits.lookbackDays ?? '미확인'}일 범위</p><p>과거 모집 자료: ${dateText(meta.historyDate)} · 학교별 조사 성공 여부는 원문에서 확인해 주세요.</p>${link(meta.recruitmentSource,'교육지원청 구인 게시판 ↗')} · ${link(meta.schoolSource,'공식 학교 명부 ↗')}</div><div class="source-card"><h3>양성교육 · 전국 디지털튜터</h3><p>확인: ${dateText(meta.trainingDate)} · ${data.training.length}건. 성남 외 지역도 포함되며 별도 탭에서 확인할 수 있습니다.</p>${(data.trainingScan.errors||[]).map(e=>'<p class="scan-fail">'+h(typeof e==='string'?e:JSON.stringify(e))+'</p>').join('')}</div><div class="coverage-table-wrap"><table class="coverage-table"><thead><tr><th>학교</th><th>지역</th><th>수집한 공고</th><th>원문 확인</th></tr></thead><tbody>${relevantSchools(data.posts).map(s=>`<tr><td><button class="text-button" data-open-school="${h(s.id)}">${h(s.name)}</button></td><td>${h(s.district)} · ${h(s.dong || '동 미상')}</td><td>${data.posts.filter(p=>p.schoolId===s.id).length}건</td><td>${link(s.homepage,'학교 홈페이지 ↗')}</td></tr>`).join('')}</tbody></table></div>`;
}
function render() {
  if (!state.data) return;
  renderFilters();
  const posts = currentPosts();
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);if(b.dataset.tab===state.tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
  $('jobsView').hidden=!['jobs','training'].includes(state.tab); $('mapView').hidden=state.tab!=='map'; $('coverageView').hidden=state.tab!=='coverage'; $('sortLabel').hidden=!['jobs','training'].includes(state.tab);
  $('viewTitle').textContent=({jobs:state.filters.saved?'관심 공고':'모집 공고',map:'학교 한눈맵',coverage:'수집 현황',training:'양성교육·전국 채용'})[state.tab];
  $('resultCount').textContent=['jobs','training'].includes(state.tab)?`${posts.length.toLocaleString()}건`:state.tab==='map'?`${relevantSchools(posts).length}개교`:'';
  const age = Math.floor((Date.parse(seoulDate()) - Date.parse(state.data.meta.collectedDate))/86400000);
  $('notice').classList.toggle('warn',age>2);
  $('notice').textContent = age>2 ? `${age}일 전 수집한 자료입니다. 현재 채용 여부와 변경된 접수기간을 원문에서 확인해 주세요.` : '최근 게시판 탐색 결과와 과거 모집 이력을 함께 표시합니다. 키워드 탐색 결과이므로 모집 대상과 접수기간은 원문을 확인하세요.';
  if(state.tab==='training')$('notice').textContent='전국 정보입니다. 지원 지역과 교육 대상은 원문에서 확인하세요. 검색·분야·연도·접수 상태 필터가 적용됩니다.';
  if(state.data.loadErrors.length){$('notice').classList.add('warn');$('notice').textContent='일부 자료를 불러오지 못했습니다: '+state.data.loadErrors.join(', ')+'. 새로고침해 다시 시도해 주세요.';}
  if (['jobs','training'].includes(state.tab)) renderJobs(posts); else if(state.tab==='map') renderMap(posts); else renderCoverage();
}
function reset() { state.filters={query:'',category:'',district:'',dong:'',year:'',favoriteSchools:null,status:'',source:'',sort:'recent',schoolId:'',saved:false}; $('query').value=''; state.limit=30; state.selected=null; render(); }
function download(text,name,type) {const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
document.addEventListener('click',event=>{
  const b=event.target.closest('button');if(!b||!state.data)return;
  if(b.dataset.tab){const changedPool=(state.tab==='training')!==(b.dataset.tab==='training');state.tab=b.dataset.tab;if(changedPool)reset();else render();}
  else if(b.dataset.schoolSave){const id=b.dataset.schoolSave;favoriteSchools=favoriteSchools.includes(id)?favoriteSchools.filter(v=>v!==id):[...favoriteSchools,id];try{localStorage.setItem('survivalmap.favorites',JSON.stringify(favoriteSchools));}catch{toast('브라우저 저장이 제한되어 이번 화면에서만 유지됩니다.');}if(state.filters.favoriteSchools)state.filters.favoriteSchools=favoriteSchools;render();}
  else if(b.id==='schoolSavedToggle'){state.tab='map';setFilter('favoriteSchools',state.filters.favoriteSchools?null:favoriteSchools);}
  else if(b.hasAttribute('data-map-reset')){state.filters.district='';setFilter('dong','');}
  else if(b.hasAttribute('data-map-district'))setFilter('dong','');
  else if(b.dataset.openSchool){state.tab='map';state.selectedSchool=b.dataset.openSchool;render();showSchool(b.dataset.openSchool,true);}
  else if(b.dataset.category!==undefined)setFilter('category',b.dataset.category);
  else if(b.dataset.post){state.selected=b.dataset.post;render();if(innerWidth<=1150)$('detail').scrollIntoView({behavior:'smooth',block:'start'});}
  else if(b.dataset.save){const id=b.dataset.save;state.favorites=state.favorites.includes(id)?state.favorites.filter(v=>v!==id):[...state.favorites,id];try{localStorage.setItem('seongnam-map-post-favorites',JSON.stringify(state.favorites));}catch{toast('브라우저 저장이 제한되어 이번 화면에서만 유지됩니다.');}render();}
  else if(b.dataset.school)showSchool(b.dataset.school,true);
  else if(b.dataset.schoolJobs){state.tab='jobs';state.filters.schoolId=b.dataset.schoolJobs;state.selected=null;state.limit=30;render();$('content').scrollIntoView({behavior:'smooth'});}
  else if(b.dataset.clear){if(b.dataset.clear==='query')$('query').value='';setFilter(b.dataset.clear,b.dataset.clear==='favoriteSchools'?null:b.dataset.clear==='saved'?false:'');}
  else if(b.dataset.stat!==undefined){if(b.dataset.stat==='map'){state.tab='map';render();}else{reset();state.tab='jobs';setFilter('status',b.dataset.stat);}$('content').scrollIntoView({behavior:'smooth'});}
  else if(b.id==='resetBtn'||b.hasAttribute('data-reset'))reset();
  else if(b.id==='savedToggle'){state.tab='jobs';setFilter('saved',!state.filters.saved);}
  else if(b.id==='loadMore'){state.limit+=30;render();}
  else if(b.id==='exportBtn'){const rows=currentPosts();download('\uFEFF'+[['학교','학교급','지역','제목','분야','게시일','접수시작','접수마감','상태','출처','원문'],...rows.map(p=>{const s=schoolById(p.schoolId);return[p.schoolName,s?.level,s?.district,p.title,p.categories.join(' / '),p.postedDate,p.startDate,p.deadlineDate,statusOf(p).label,p.sources.map(s=>s.name).join(' / '),p.url];})].map(r=>r.map(csvCell).join(',')).join('\r\n'),`성남-강사공고-${seoulDate()}.csv`,'text/csv;charset=utf-8');toast(`${rows.length}건의 공고를 내려받았습니다.`);}
  else if(b.id==='dataBtn')download(JSON.stringify(state.data,null,2),`성남-강사채용맵-${seoulDate()}.json`,'application/json');
});
$('query').addEventListener('input',e=>setFilter('query',e.target.value));
['district','dong','year','status','source','sort'].forEach(key=>$(key).addEventListener('change',e=>setFilter(key,e.target.value)));
try { state.data=await loadData(); $('updatedAt').textContent=dateText(state.data.meta.collectedDate);stats();render(); }
catch(error){$('notice').textContent='데이터를 불러오지 못했습니다. 새로고침해 다시 시도해 주세요.';$('notice').classList.add('warn');console.error(error);}
