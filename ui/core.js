export const CATEGORIES = ['방과후', '늘봄', '디지털튜터', 'AI 코디네이터', '디지털·AI', '예술·체육', '기타 강사'];
export const DISTRICTS = ['분당구', '수정구', '중원구'];
export function seoulDate(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export function statusOf(post, today = seoulDate()) {
  if (!post.deadlineDate) return { key: 'unknown', label: '접수일 확인', tone: 'unknown' };
  if (post.deadlineDate < today) return { key: 'closed', label: '접수 종료', tone: 'closed' };
  if (post.startDate && post.startDate > today) return { key: 'upcoming', label: '접수 예정', tone: 'upcoming' };
  const days = Math.round((Date.parse(post.deadlineDate + 'T00:00:00+09:00') - Date.parse(today + 'T00:00:00+09:00')) / 86400000);
  return { key: 'open', label: days === 0 ? '오늘 마감 · 시간 확인' : days <= 3 ? `D-${days} · 마감 임박` : '접수기간 내', tone: days <= 3 ? 'urgent' : 'open' };
}
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function safeUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; }
}
export function filteredPosts(posts, schools, filters, favorites = []) {
  const index = new Map(schools.map(s => [s.id, s]));
  const query = (filters.query || '').trim().toLocaleLowerCase('ko');
  const today = seoulDate();
  const deadlineRank = p => !p.deadlineDate ? 1 : p.deadlineDate < today ? 2 : 0;
  return posts.filter(p => {
    const school = index.get(p.schoolId);
    const status = statusOf(p);
    return (!query || [p.title, p.schoolName, school?.address, school?.dong, ...(p.categories || [])].join(' ').toLocaleLowerCase('ko').includes(query))
      && (!filters.district || school?.district === filters.district)
      && (!filters.dong || (school?.dong || '동 미상') === filters.dong)
      && (!filters.year || String(p.year) === filters.year)
      && (!filters.favoriteSchools || filters.favoriteSchools.includes(p.schoolId))
      && (!filters.level || school?.level === filters.level)
      && (!filters.category || p.categories.includes(filters.category))
      && (!filters.source || p.sources.some(s => s.name === filters.source))
      && (!filters.schoolId || p.schoolId === filters.schoolId)
      && (!filters.status || (filters.status === 'urgent' ? status.tone === 'urgent' : status.key === filters.status))
      && (!filters.saved || favorites.includes(p.id));
  }).sort((a, b) => filters.sort === 'deadline'
    ? deadlineRank(a) - deadlineRank(b) || (deadlineRank(a) === 0 ? a.deadlineDate.localeCompare(b.deadlineDate) : 0) || (b.postedDate || '').localeCompare(a.postedDate || '')
    : (b.postedDate || '').localeCompare(a.postedDate || '') || a.title.localeCompare(b.title, 'ko'));
}
export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+@\-\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
