// 서울 채용공고 모니터 — 11개 교육지원청 구인 게시판(/FUS/JO/JOL11.do)
// 표 구조: 번호 | 기관명 | 지역 | 학교급 | 분야(과목) | 직종 | 마감일
// 출력: data/seoul_notice_hits.json, seoul_notice_new.json, seoul_notice_state.json
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OFFICES = [
  { code: "dbedu", label: "동부(동대문·중랑)" },
  { code: "sbedu", label: "서부(은평·서대문·마포)" },
  { code: "nbedu", label: "남부(영등포·구로·금천)" },
  { code: "bbedu", label: "북부(노원·도봉)" },
  { code: "jbedu", label: "중부(종로·중구·용산)" },
  { code: "gdspedu", label: "강동송파" },
  { code: "gsycedu", label: "강서양천" },
  { code: "gnscedu", label: "강남서초" },
  { code: "dgedu", label: "동작관악" },
  { code: "sdgjedu", label: "성동광진" },
  { code: "sbgbedu", label: "성북강북" }
];

// 교육지원청 게시판은 그 자체가 "구인 게시판"이라 전부 채용공고.
// 따라서 화이트리스트(특정 키워드만)가 아니라, 강사·교육직과 무관한
// 직군만 제외하는 블랙리스트 방식으로 폭넓게 수집한다.
const EXCLUDE_JOBS = /영양사|조리|급식|행정실|행정직|시설|전산|당직|경비|청소|미화|운전|통학차량|회계|사무원|보안|기계|전기설비|배움터지킴이|학교보안관|환경|소독|방역|세무|총무|경리|수위|연구원/;

// 페이지당 최대 페이지 수 (JOL11.do는 페이지당 약 10건)
const MAX_PAGES = 6;

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

function cleanHtml(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchText(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" }
      });
      if (response.ok) return response.text();
      if (attempt === 3) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await sleep(2000 * attempt);
  }
}

// 게시판 헤더(th) 추출 — 11개 교육지원청이 컬럼 구조가 제각각이라 헤더로 매핑
function extractHeaders(html) {
  return [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) => cleanHtml(m[1])).filter(Boolean);
}

// 헤더 텍스트 → 컬럼 인덱스 매핑
function buildColumnMap(headers) {
  const map = { school: null, level: null, jobType: null, deadline: null, titleCols: [] };
  headers.forEach((h, i) => {
    if (map.school === null && /기관명|학교명/.test(h)) map.school = i;
    if (map.level === null && /학교급|학교구분|대상/.test(h)) map.level = i;
    if (map.deadline === null && /마감/.test(h)) map.deadline = i;
    if (map.jobType === null && /직종/.test(h)) map.jobType = i;
    if (/제목|분야|과목/.test(h)) map.titleCols.push(i);
  });
  // 기관명·학교명이 없으면 작성자/작성인 컬럼이 학교명 역할
  if (map.school === null) {
    headers.forEach((h, i) => { if (map.school === null && /작성자|작성인/.test(h)) map.school = i; });
  }
  return map;
}

// JOL11.do 목록 행 파싱 (헤더 기반 동적 매핑 — 청마다 컬럼 순서가 달라서 필수)
function parseBoard(html, office) {
  const map = buildColumnMap(extractHeaders(html));
  const items = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const seq = row.match(/fncDetailView\('(\d+)'\)/)?.[1];
    if (!seq) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtml(m[1]));
    if (!cells.length) continue;
    const get = (i) => (i !== null && i >= 0 && i < cells.length ? cells[i] : "");

    const school = get(map.school);
    const level = map.level !== null ? (get(map.level) || "전체") : "전체";
    const jobType = get(map.jobType);
    const subject = (map.titleCols.length ? map.titleCols.map(get) : [])
      .filter((x) => x && x !== "-")
      .join(" ")
      .trim();
    const dl = get(map.deadline);
    const deadline = /^\d{4}[-.]\d{2}[-.]\d{2}$/.test(dl) ? dl.replace(/\./g, "-") : null;

    if (!subject) continue; // 제목 없는 행(공지·소계 등) 제외
    items.push({ seq, school, region: "", level, subject, jobType, deadline, office });
  }
  return items;
}

async function loadJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf-8")); } catch { return fallback; }
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const statePath = join(dataDir, "seoul_notice_state.json");
  const state = await loadJson(statePath, { seenIds: {} });
  if (!state.seenIds || typeof state.seenIds !== "object") state.seenIds = {};

  // 학교명 → id 매핑 (지도 배지용)
  const schools = await loadJson(join(dataDir, "seoul_schools.json"), []);
  const schoolIdByName = new Map(schools.map((s) => [s.name, s.id]));

  const all = [];
  const errors = [];
  for (const office of OFFICES) {
    const baseUrl = `https://${office.code}.sen.go.kr/FUS/JO/JOL11.do`;
    try {
      // 페이지네이션 — pageIndex로 여러 페이지 수집 (신규 행이 없으면 중단)
      const seenSeq = new Set();
      const rows = [];
      for (let pageIndex = 1; pageIndex <= MAX_PAGES; pageIndex += 1) {
        const pageUrl = `${baseUrl}?pageIndex=${pageIndex}`;
        const html = await fetchText(pageUrl);
        const pageRows = parseBoard(html, office);
        let added = 0;
        for (const r of pageRows) {
          if (!seenSeq.has(r.seq)) { seenSeq.add(r.seq); rows.push(r); added += 1; }
        }
        if (pageRows.length < 10 || added === 0) break; // 마지막 페이지거나 중복뿐이면 중단
        await sleep(400);
      }

      const kept = rows.filter((r) => {
        if (!/초등|전체/.test(r.level)) return false;          // 초등·전체 학교급만
        if (r.deadline && r.deadline < today) return false;     // 마감 지난 공고 제외
        if (EXCLUDE_JOBS.test(`${r.subject} ${r.jobType}`)) return false; // 무관 직군 제외
        // 순수 유치원 공고 제외 (사용자는 초등 강사). 단 "초등학교병설유치원"은 초등 소속이라 유지
        if (/유치원|에듀케어/.test(`${r.school} ${r.subject}`) && !/초등학교/.test(r.school)) return false;
        return true;
      });

      for (const r of kept) {
        // "서울구일초등학교(○○교육지원청 학교통합지원과)" → 괄호 제거 후 학교 매칭
        const schoolKey = r.school.replace(/\(.*?\)\s*$/, "").trim();
        all.push({
          id: `seoul:${office.code}:${r.seq}`,
          schoolId: schoolIdByName.get(schoolKey) || null,
          schoolName: r.school,
          schoolHomepage: null,
          boardLabel: `서울 ${office.label} 구인`,
          boardUrl: baseUrl,
          postedAt: null,
          deadline: r.deadline ? `${r.deadline}T00:00:00+09:00` : null,
          title: `${r.subject}${r.jobType && r.jobType !== "전체" ? ` (${r.jobType})` : ""}`,
          url: baseUrl
        });
      }
      console.log(`${office.label}: ${rows.length}행 중 ${kept.length}건`);
    } catch (error) {
      errors.push(`${office.label}: ${error.message}`);
      console.error(`${office.label} 실패: ${error.message}`);
    }
    await sleep(700);
  }

  // 중복 제거 + 마감 임박순
  const seen = new Set();
  const flat = all.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  flat.sort((a, b) => String(a.deadline || "9999").localeCompare(String(b.deadline || "9999")));

  const newItems = flat.filter((item) => !state.seenIds[item.id]);
  for (const item of newItems) state.seenIds[item.id] = now.toISOString();

  await writeFile(join(dataDir, "seoul_notice_hits.json"),
    JSON.stringify({ generatedAt: now.toISOString(), hitCount: flat.length, errors, items: flat }, null, 2) + "\n", "utf-8");
  await writeFile(join(dataDir, "seoul_notice_new.json"),
    JSON.stringify({ generatedAt: now.toISOString(), newCount: newItems.length, items: newItems }, null, 2) + "\n", "utf-8");
  await writeFile(statePath,
    JSON.stringify({ updatedAt: now.toISOString(), seenIds: state.seenIds }, null, 2) + "\n", "utf-8");

  console.log(`합계 ${flat.length}건, 신규 ${newItems.length}건`);
}

main().catch((error) => { console.error(error); process.exit(1); });
