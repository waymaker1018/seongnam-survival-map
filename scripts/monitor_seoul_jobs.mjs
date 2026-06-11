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

// 성남 모니터와 같은 관심 키워드 — 기관명+분야+직종 텍스트에 적용
const KEYWORDS = [
  "AI", "인공지능", "디지털튜터", "디지털 튜터", "SW", "소프트웨어", "코딩", "블록코딩",
  "로봇", "피지컬", "메이커", "마이크로비트", "아두이노", "레고", "드론",
  "늘봄", "방과후", "방과 후", "돌봄", "강사", "특기적성", "맞춤형교실", "디지털새싹", "에듀테크"
];

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

// JOL11.do 목록 행 파싱
function parseBoard(html, office) {
  const items = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const seq = row.match(/fncDetailView\('(\d+)'\)/)?.[1];
    if (!seq) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => cleanHtml(m[1]));
    // [번호, 기관명, 지역, 학교급, 분야, 직종, 마감일]
    if (cells.length < 7) continue;
    const [, school, region, level, subject, jobType, deadlineText] = cells;
    const deadline = /^\d{4}-\d{2}-\d{2}$/.test(deadlineText) ? deadlineText : null;
    items.push({ seq, school, region, level, subject, jobType, deadline, office });
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
    const url = `https://${office.code}.sen.go.kr/FUS/JO/JOL11.do`;
    try {
      const html = await fetchText(url);
      const rows = parseBoard(html, office);
      const kept = rows.filter((r) => {
        if (!/초등|전체/.test(r.level)) return false;
        if (r.deadline && r.deadline < today) return false; // 마감 지난 공고 제외
        const haystack = `${r.school} ${r.subject} ${r.jobType}`.toLowerCase();
        return KEYWORDS.some((k) => haystack.includes(k.toLowerCase()));
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
          boardUrl: url,
          postedAt: null,
          deadline: r.deadline ? `${r.deadline}T00:00:00+09:00` : null,
          title: `${r.subject}${r.jobType && r.jobType !== "전체" ? ` (${r.jobType})` : ""}`,
          url
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
