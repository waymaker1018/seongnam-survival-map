import { seoulDate, safeUrl, CATEGORIES } from './core.js';

export function dateOnly(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) return null;
  return text.includes('T') ? seoulDate(date) : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function categoriesFor(title) {
  const rules = [/방과\s?후|특기적성/, /늘봄|돌봄|맞춤형/, /디지털\s?튜터/, /AI\s?코디|인공지능\s?코디/i,
    /AI|인공지능|코딩|SW|소프트|디지털|로봇|메이커|피지컬|아두이노|마이크로비트|에듀테크|컴퓨터|드론|3D|미디어|정보/i,
    /예술|미술|음악|체육|댄스|난타|바둑|체스|연극|악기|소금|단소|놀이|무용|공예/];
  const categories = rules.flatMap((rule, i) => rule.test(title || '') ? [CATEGORIES[i]] : []);
  return categories.length ? categories : ['기타 강사'];
}

function sourceKey(url) {
  if (!url) return '';
  const parsed = new URL(url);
  // 같은 게시물의 메뉴 번호만 다른 링크를 묶는다. 학교별 호스트와 게시판은 보존한다.
  parsed.searchParams.delete('mi');
  parsed.searchParams.sort();
  parsed.hash = '';
  return parsed.href;
}

function homepage(value) {
  const text = String(value || '').trim();
  return safeUrl(text.includes('://') ? text : `https://${text}`);
}

export function adaptData(schools, history, hits, training, meta) {
  const normalizedSchools = schools.map(s => ({...s, level:'초등학교', address:s.fullAddress || s.address || '', homepage:homepage(s.homepage)}));
  const records = [
    ...history.map(r => ({...r, url:r.sourceUrl, source:'성남교육지원청', checkedAt:r.sourceCheckedAt})),
    ...hits.items.map(r => ({...r, postedDate:r.postedAt, deadlineDate:r.deadline,
      source:r.schoolId ? '학교 게시판' : '성남교육지원청', checkedAt:hits.generatedAt}))
  ];
  const merged = new Map();
  for (const r of records) {
    const url = safeUrl(r.url), key = sourceKey(url) || String(r.id);
    const post = { ...r, id:String(r.id), url, schoolId:r.schoolId || null, schoolName:r.schoolName || '기관 통합 모집',
      postedDate:dateOnly(r.postedDate), startDate:dateOnly(r.startDate), deadlineDate:dateOnly(r.deadlineDate),
      year:r.recruitmentYear || Number(dateOnly(r.postedDate)?.slice(0,4)) || null,
      categories:categoriesFor(r.title), sources:[{name:r.source, url}] };
    const existing = merged.get(key);
    if (!existing) { merged.set(key,post); continue; }
    if (!existing.sources.some(s => s.name === r.source && s.url === url)) existing.sources.push(...post.sources);
    if (!existing.schoolId && post.schoolId) { existing.schoolId = post.schoolId; existing.schoolName = post.schoolName; }
    if (existing.deadlineDate && post.deadlineDate && existing.deadlineDate !== post.deadlineDate) existing.dateConflict = true;
    existing.deadlineDate = existing.dateConflict ? null : post.deadlineDate || existing.deadlineDate;
    existing.checkedAt = post.checkedAt || existing.checkedAt;
  }
  const trainingPosts = training.items.map(r => ({...r, id:`training:${r.id}`, schoolId:null, schoolName:r.source,
    url:safeUrl(r.url), postedDate:dateOnly(r.postedAt), startDate:dateOnly(r.startDate), deadlineDate:dateOnly(r.deadline),
    year:Number(dateOnly(r.postedAt)?.slice(0,4)) || null, categories:categoriesFor(r.title),
    sources:[{name:r.source || '양성교육·전국 채용',url:safeUrl(r.url)}],checkedAt:training.generatedAt}));
  return {schools:normalizedSchools, posts:[...merged.values()], training:trainingPosts,
    meta:{...meta,collectedDate:dateOnly(hits.generatedAt),historyDate:dateOnly(meta.generatedAt),trainingDate:dateOnly(training.generatedAt)},
    hits, trainingScan:training, loadErrors:[]};
}

export async function loadData() {
  const errors = [];
  async function read(name, fallback) {
    try {
      const response = await fetch(`./data/${name}.json`);
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (Array.isArray(fallback) ? !Array.isArray(data) : name !== 'meta' && !Array.isArray(data.items)) throw Error('자료 형식 오류');
      return data;
    } catch {
      errors.push(name);
      return fallback;
    }
  }
  const input = await Promise.all([read('schools',[]),read('recruitments',[]),read('school_notice_hits',{items:[]}),read('training_hits',{items:[]}),read('meta',{})]);
  const data = adaptData(...input);
  data.loadErrors = errors;
  return data;
}
