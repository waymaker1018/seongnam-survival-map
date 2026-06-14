// 양성교육·전국 디지털튜터 모니터
// 대상:
//  1) 디지털튜터 포털 채용 게시판 (전국 집계) — 경기·서울만 필터
//  2) 디지털튜터 포털 공지 게시판 — 양성과정·사업 공고
//  3) 교육부 공고 게시판 — 디지털튜터 양성과정·AI 강사 양성 등 국가 무료 교육
// 출력: data/training_hits.json(전체), training_new.json(신규), training_state.json(중복방지)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");

const DT_JOBS_URL = "https://dt.kosac.re.kr/dt/empmn/list/454";
const DT_BOARD_URL = "https://dt.kosac.re.kr/brd/board/450/L/menu/458";
const MOE_LIST_URL = "https://www.moe.go.kr/boardCnts/listRenew.do?boardID=294&m=020402&s=moe";
const MOE_VIEW_URL = (seq) =>
  `https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=294&boardSeq=${seq}&lev=0&m=020402&s=moe`;

// 채용 게시판 지역 필터 — 성남(경기) + 서울만
const JOB_REGIONS = /(경기|서울)/;

// 교육부 공고 키워드 — 사용자가 놓치면 안 되는 국가 무료 양성교육
const MOE_KEYWORDS = [
  "디지털튜터", "디지털 튜터", "튜터 양성",
  "AI 강사", "인공지능 강사", "강사 양성", "강사양성",
  "디지털새싹", "디지털 새싹",
  "양성 과정", "양성과정", "교육생 모집"
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&#40;/g, "(").replace(/&#41;/g, ")").replace(/&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function cleanHtml(value) {
  return decodeEntities(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      accept: "text/html",
      "accept-language": "ko-KR,ko;q=0.9"
    }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

// 교육부는 해외 IP(GitHub 서버)를 간헐 차단 — 간격을 두고 재시도.
// 못 잡아도 공고가 목록에 1~2주 머물고 하루 2회 실행되므로 이후 실행에서 잡힘.
async function fetchTextRetry(url, attempts = 4) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      return await fetchText(url);
    } catch (error) {
      if (i === attempts) throw error;
      await sleep(2000 * i);
    }
  }
  throw new Error("unreachable");
}

// 1) 디지털튜터 포털 채용 — 지역·학교·인원·접수기간 구조화 행
function parseDtJobs(html) {
  const items = [];
  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const link = row.match(/<a[^>]*href="([^"]+)"[^>]*class="jobListTitle"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = cleanHtml(link[2]);
    const region = cleanHtml(row.match(/지역\s*:\s*<span>([^<]*)<\/span>/i)?.[1] || "");
    const school = cleanHtml(row.match(/학교명\s*:\s*<span>([^<]*)<\/span>/i)?.[1] || "");
    const count = cleanHtml(row.match(/채용인원\s*:\s*<span>([^<]*)<\/span>/i)?.[1] || "");
    const posted = cleanHtml(row.match(/등록일\s*:\s*<span>([^<]*)<\/span>/i)?.[1] || "");
    const periods = [...row.matchAll(/<p>\s*(\d{4}\.\d{2}\.\d{2})\s*<\/p>/gi)].map((m) => m[1]);
    if (!JOB_REGIONS.test(region)) continue;
    const url = decodeEntities(link[1]).trim();
    items.push({
      id: `dtjob:${url}`,
      source: "전국 디지털튜터 채용",
      title: `[${region}${school ? " · " + school : ""}] ${title}${count ? ` (${count}명)` : ""}`,
      postedAt: posted ? `${posted.replace(/\./g, "-")}T00:00:00+09:00` : null,
      deadline: periods.length >= 4 ? `${periods[3].replace(/\./g, "-")}T00:00:00+09:00` : null,
      url
    });
  }
  return items;
}

// 2) 디지털튜터 포털 공지 게시판 — 일반 표 구조
function parseDtBoard(html) {
  const items = [];
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  for (const rowMatch of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const link = row.match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!link) continue;
    const title = cleanHtml(link[2]);
    // 채용·양성과정 모집 외 순수 안내성 공지(리플렛·회원가입·이용안내 등) 제외
    if (/리플렛|FAQ|회원\s*가입|이용\s*안내|메뉴|매뉴얼|사용\s*방법|가이드/.test(title)) continue;
    const date = row.match(/<td[^>]*class="date"[^>]*>\s*([\d-]+)\s*<\/td>/i)?.[1] || null;
    const href = decodeEntities(link[1]).trim();
    const url = /^https?:/i.test(href) ? href : `https://dt.kosac.re.kr${href}`;
    const bbsSn = url.match(/bbsSn=(\d+)/)?.[1] || url;
    items.push({
      id: `dtboard:${bbsSn}`,
      source: "디지털튜터 포털 공지",
      title,
      postedAt: date ? `${date}T00:00:00+09:00` : null,
      deadline: null,
      url
    });
  }
  return items;
}

// 3) 교육부 공고 — goView('294','글번호') 패턴 + 키워드 필터
function parseMoe(html) {
  const items = [];
  const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  for (const rowMatch of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const link = row.match(/goView\('294',\s*'(\d+)'[^)]*\)[^>]*title="([^"]*)"/i)
      || row.match(/title="([^"]*)"[^>]*onclick="[^"]*goView\('294',\s*'(\d+)'/i);
    if (!link) continue;
    const seq = /^\d+$/.test(link[1]) ? link[1] : link[2];
    const title = decodeEntities(/^\d+$/.test(link[1]) ? link[2] : link[1]).trim();
    const date = row.match(/<td[^>]*>\s*(\d{4}-\d{2}-\d{2})\s*<\/td>/i)?.[1] || null;
    if (!MOE_KEYWORDS.some((k) => title.replace(/\s+/g, " ").includes(k))) continue;
    items.push({
      id: `moe:${seq}`,
      source: "교육부 공고",
      title,
      postedAt: date ? `${date}T00:00:00+09:00` : null,
      deadline: null,
      url: MOE_VIEW_URL(seq)
    });
  }
  return items;
}

async function loadState() {
  try {
    const parsed = JSON.parse(await readFile(join(dataDir, "training_state.json"), "utf-8"));
    return parsed?.seenIds && typeof parsed.seenIds === "object" ? { seenIds: parsed.seenIds } : { seenIds: {} };
  } catch {
    return { seenIds: {} };
  }
}

async function main() {
  await mkdir(dataDir, { recursive: true });
  const now = new Date();
  const state = await loadState();
  const all = [];
  const errors = [];

  const sources = [
    { name: "디지털튜터 채용", url: DT_JOBS_URL, parse: parseDtJobs },
    { name: "디지털튜터 공지", url: DT_BOARD_URL, parse: parseDtBoard },
    // 교육부 공고는 최근 5페이지(약 10일치) — 간헐 접속 실패를 다음 실행에서 만회
    ...[1, 2, 3, 4, 5].map((page) => ({
      name: `교육부 공고 ${page}p`,
      url: `${MOE_LIST_URL}&page=${page}`,
      parse: parseMoe
    }))
  ];

  for (const source of sources) {
    try {
      const html = await fetchTextRetry(source.url);
      const items = source.parse(html);
      all.push(...items);
      console.log(`${source.name}: ${items.length}건`);
    } catch (error) {
      errors.push(`${source.name}: ${error.message}`);
      console.error(`${source.name} 실패: ${error.message}`);
    }
    await sleep(800);
  }

  // 중복 제거 + 최신순
  const seen = new Set();
  const flat = all.filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)));
  flat.sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));

  const newItems = flat.filter((item) => !state.seenIds[item.id]);
  for (const item of newItems) state.seenIds[item.id] = now.toISOString();

  await writeFile(join(dataDir, "training_hits.json"),
    JSON.stringify({ generatedAt: now.toISOString(), hitCount: flat.length, errors, items: flat }, null, 2) + "\n", "utf-8");
  await writeFile(join(dataDir, "training_new.json"),
    JSON.stringify({ generatedAt: now.toISOString(), newCount: newItems.length, items: newItems }, null, 2) + "\n", "utf-8");
  await writeFile(join(dataDir, "training_state.json"),
    JSON.stringify({ updatedAt: now.toISOString(), seenIds: state.seenIds }, null, 2) + "\n", "utf-8");

  console.log(`합계 ${flat.length}건, 신규 ${newItems.length}건`);
}

main().catch((error) => { console.error(error); process.exit(1); });
