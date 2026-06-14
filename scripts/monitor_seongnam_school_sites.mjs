import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");

const DEFAULT_LOOKBACK_DAYS = 21;
const DEFAULT_CONCURRENCY = 6;

const BOARD_LABEL_ALLOW = [
  /공지사항/i,
  /채용/i,
  /모집/i,
  /강사/i,
  /방과후/i,
  /늘봄/i,
  /돌봄/i
];

const BOARD_LABEL_DENY = [
  /급식/i,
  /식단/i,
  /영양/i,
  /보건/i,
  /운영위원회/i,
  /입찰/i,
  /수의\s*계약/i,
  /예산/i,
  /결산/i,
  /상품권/i
];

// 교육지원청 공식 게시판 — 학교 홈페이지와 같은 CMS라서 동일 파서로 처리 가능
const OFFICE_BOARDS = [
  {
    label: "성남교육지원청 구인",
    url: "https://www.goesn.kr/goesn/na/ntt/selectNttList.do?bbsId=17872&mi=23603"
  }
];

const KEYWORDS = [
  "AI",
  "인공지능",
  "디지털튜터",
  "디지털 튜터",
  "SW",
  "소프트웨어",
  "코딩",
  "블록코딩",
  "로봇코딩",
  "로봇 코딩",
  "피지컬",
  "피지컬코딩",
  "피지컬 코딩",
  "피지컬컴퓨팅",
  "피지컬 컴퓨팅",
  "메이커",
  "마이크로비트",
  "micro:bit",
  "아두이노",
  "센서",
  "레고",
  "스파이크",
  "햄스터봇",
  "오조봇",
  "늘봄",
  "방과후",
  "방과 후",
  "강사",
  "특강",
  "캠프",
  "디지털새싹",
  "디지털 새싹"
];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

function cleanHtml(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 seongnam-after-school-map monitor",
      accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  return response.text();
}

function withSearchParams(inputUrl, params) {
  const url = new URL(inputUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url.toString();
}

function parseKoreanDate(value) {
  if (!value) return null;
  const match = String(value).match(/(\d{4})[.\-\/](\d{2})[.\-\/](\d{2})/);
  if (!match) return null;
  const iso = `${match[1]}-${match[2]}-${match[3]}T00:00:00+09:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pickBoardsFromMain(mainHtml, baseUrl) {
  const boards = [];
  const seen = new Set();
  for (const match of mainHtml.matchAll(/<a[^>]*href="([^"]*selectNttList\.do\?[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = decodeEntities(match[1] || "").trim();
    const label = cleanHtml(match[2] || "").replace(/\s+/g, " ").trim();
    if (!href) continue;
    if (!label) continue;
    if (!BOARD_LABEL_ALLOW.some((re) => re.test(label))) continue;
    if (BOARD_LABEL_DENY.some((re) => re.test(label))) continue;
    let absoluteUrl = href;
    if (!/^https?:\/\//i.test(absoluteUrl)) absoluteUrl = new URL(absoluteUrl, baseUrl).toString();
    const key = `${absoluteUrl}::${label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    boards.push({ label, url: absoluteUrl });
  }
  return boards.slice(0, 8);
}

function parseBoardPosts(listHtml, listUrl) {
  const tbody = listHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const posts = [];
  for (const rowMatch of tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1];

    let nttSn = null;
    let title = "";
    let url = null;

    // 구형: selectNttInfo.do?nttSn= 직접 링크
    const directMatch = rowHtml.match(/<a[^>]*href="([^"]*selectNttInfo\.do\?[^"]*nttSn=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/i);
    // 신형(2026 개편): <a href="javascript:" data-id="..." class="nttInfoBtn">제목</a>
    const buttonMatch = rowHtml.match(/<a[^>]*data-id="(\d+)"[^>]*class="[^"]*nttInfoBtn[^"]*"[^>]*>([\s\S]*?)<\/a>/i)
      || rowHtml.match(/<a[^>]*class="[^"]*nttInfoBtn[^"]*"[^>]*data-id="(\d+)"[^>]*>([\s\S]*?)<\/a>/i);

    if (directMatch) {
      const relative = decodeEntities(directMatch[1] || "").trim();
      title = cleanHtml(directMatch[2] || "");
      url = /^https?:\/\//i.test(relative) ? relative : new URL(relative, listUrl).toString();
      nttSn = new URL(url).searchParams.get("nttSn") || null;
    } else if (buttonMatch) {
      nttSn = buttonMatch[1];
      title = cleanHtml(buttonMatch[2] || "");
      // 목록 URL에서 상세 URL 구성 — 같은 CMS의 표준 패턴
      const detail = new URL(listUrl);
      detail.pathname = detail.pathname.replace(/selectNttList\.do$/, "selectNttInfo.do");
      detail.searchParams.delete("listCo");
      detail.searchParams.delete("currPage");
      detail.searchParams.set("nttSn", nttSn);
      url = detail.toString();
    } else {
      continue;
    }

    // "새로운 글" 스크린리더 텍스트 제거 + 공백 정리
    title = title.replace(/새로운\s*글/g, "").replace(/\s+/g, " ").trim();

    // 행에 날짜가 2개면 [마감일, 등록일] 순서 — 마지막 것이 등록일
    const dates = cleanHtml(rowHtml).match(/\d{4}[.\-\/]\d{2}[.\-\/]\d{2}/g) || [];
    const postedAt = parseKoreanDate(dates[dates.length - 1] || null);
    const deadline = dates.length >= 2 ? parseKoreanDate(dates[0]) : null;

    // 셀 텍스트 — 교육지원청 게시판의 기관명 추출용
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)]
      .map((m) => cleanHtml(m[1]).replace(/새로운\s*글/g, "").replace(/\s+/g, " ").trim());

    posts.push({ nttSn, title, postedAt, deadline, url, cells });
  }
  return posts;
}

// 교육지원청 구인 게시판은 유치원·중·고 공고도 섞여 있어 초등 관련만 통과
function officeRelevant(post) {
  const agency = (post.cells || []).find((c) => /(학교|유치원|교육지원청|교육청|진흥원|센터)$/.test(c)) || "";
  if (agency) {
    if (/초등학교$/.test(agency)) return true;
    if (/(교육지원청|교육청)$/.test(agency)) return true;
    return false;
  }
  return /초등|[가-힣]{1,6}초[ ·]/.test(post.title);
}

function matchesKeywords(text) {
  const haystack = String(text || "").toLowerCase();
  return KEYWORDS.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

// 채용 공고 신호어 — 제목에 하나는 있어야 통과
const RECRUIT_SIGNALS = [
  /채용/, /모집/, /공모/, /선발/, /구인/, /위촉/, /초빙/, /외부\s*강사/, /개인\s*위탁/
];

// 채용처럼 보여도 실제로는 운영·안내성 공지 — 하나라도 있으면 제외
const NON_RECRUIT_DENY = [
  /투명사회/, /협약/,
  /만족도/, /공개\s*수업/, /공개\s*주간/, /공개\s*의\s*날/, /공개의\s*날/, /참관/, /공개\s*주\s*간/,
  /수강\s*신청/, /수강\s*안내/, /수강\s*인원/, /수강\s*현황/, /수강신청/,
  /정산/, /집행/, /부담\s*경비/, /부담금/, /납부/, /부담\s*금/,
  /현황\s*안내/, /수업\s*계획/, /지도\s*계획/, /운영\s*계획/, /지도안/, /수업안/, /계획안/, /계획서/,
  /폐강/, /시간표/, /안내장/, /가정통신문/, /결과\s*보고/, /결과\s*안내/, /운영\s*결과/, /조사\s*결과/,
  /이행/, /심사\s*계획/, /특강/, /수강신청결과/, /운영\s*안내/, /수업\s*안/, /운영프로그램/,
  /부서별\s*수업/, /프로그램\s*안내/, /신청\s*안내/, /수강\s*신청/, /수강생/
];

// "채용에 대한 공지"만 통과 — 채용 신호어 있고 비채용 키워드 없음
function isRecruitment(title) {
  const text = String(title || "").replace(/\s+/g, " ");
  if (NON_RECRUIT_DENY.some((re) => re.test(text))) return false;
  return RECRUIT_SIGNALS.some((re) => re.test(text));
}

function runPool(items, concurrency, fn) {
  const queue = [...items];
  const results = [];
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try {
        results.push(await fn(item));
      } catch (error) {
        results.push({ error, item });
      }
    }
  });
  return Promise.all(workers).then(() => results);
}

async function loadSchools() {
  try {
    const json = await readFile(join(dataDir, "schools.json"), "utf-8");
    return JSON.parse(json);
  } catch {
    throw new Error("Missing data/schools.json. Run `npm run fetch:data` (or `npm run seed:schools`) first.");
  }
}

async function loadState() {
  try {
    const json = await readFile(join(dataDir, "school_notice_state.json"), "utf-8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object") return { seenIds: {} };
    if (!parsed.seenIds || typeof parsed.seenIds !== "object") return { seenIds: {} };
    return { seenIds: parsed.seenIds };
  } catch {
    return { seenIds: {} };
  }
}

async function main() {
  const lookbackDays = Number(process.argv.find((arg) => arg.startsWith("--lookback-days="))?.split("=")[1] || DEFAULT_LOOKBACK_DAYS);
  const concurrency = Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] || DEFAULT_CONCURRENCY);
  const now = new Date();
  const cutoff = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  await mkdir(dataDir, { recursive: true });

  const state = await loadState();
  const schools = await loadSchools();
  const activeSchools = schools.filter((school) => school.status !== "휴교" && school.status !== "폐교");

  const perSchool = await runPool(activeSchools, concurrency, async (school) => {
    const hostname = new URL(school.homepage).hostname;
    const siteId = hostname.split(".")[0];
    const baseUrl = `https://${hostname}/${siteId}/`;
    const mainUrl = `${baseUrl}main.do`;
    const mainHtml = await fetchText(mainUrl);
    const boards = pickBoardsFromMain(mainHtml, baseUrl);

    const boardResults = [];
    for (const board of boards) {
      const listUrl = withSearchParams(board.url, { listCo: 50, currPage: 1 });
      let listHtml = "";
      try {
        listHtml = await fetchText(listUrl);
      } catch {
        continue;
      }
      const posts = parseBoardPosts(listHtml, listUrl)
        .filter((post) => post.title && matchesKeywords(post.title))
        .filter((post) => isRecruitment(post.title))
        .filter((post) => !post.postedAt || post.postedAt >= cutoff);

      for (const post of posts) {
        boardResults.push({
          id: `${school.id}:${siteId}:${post.nttSn || post.url}`,
          schoolId: school.id,
          schoolName: school.name,
          schoolHomepage: school.homepage,
          boardLabel: board.label,
          boardUrl: listUrl,
          postedAt: post.postedAt ? post.postedAt.toISOString() : null,
          deadline: post.deadline ? post.deadline.toISOString() : null,
          title: post.title,
          url: post.url
        });
      }
    }

    return boardResults;
  });

  // 교육지원청 게시판 스캔 — 학교별 스캔과 별도로 항상 수행
  const officeResults = [];
  for (const board of OFFICE_BOARDS) {
    const listUrl = withSearchParams(board.url, { listCo: 50, currPage: 1 });
    try {
      const listHtml = await fetchText(listUrl);
      const posts = parseBoardPosts(listHtml, listUrl)
        .filter((post) => post.title && matchesKeywords(post.title))
        .filter((post) => isRecruitment(post.title))
        .filter((post) => !post.postedAt || post.postedAt >= cutoff)
        .filter(officeRelevant);
      for (const post of posts) {
        officeResults.push({
          id: `office:goesn:${post.nttSn || post.url}`,
          schoolId: null,
          schoolName: board.label,
          schoolHomepage: "https://www.goesn.kr",
          boardLabel: board.label,
          boardUrl: listUrl,
          postedAt: post.postedAt ? post.postedAt.toISOString() : null,
          deadline: post.deadline ? post.deadline.toISOString() : null,
          title: post.title,
          url: post.url
        });
      }
    } catch (error) {
      console.error(`교육지원청 게시판 스캔 실패 (${board.label}): ${error.message}`);
    }
  }

  // 같은 글이 두 게시판(공지사항+방과후 등)에서 발견되면 한 번만 유지
  const merged = [...perSchool.flatMap((entry) => (Array.isArray(entry) ? entry : [])), ...officeResults];
  const seen = new Set();
  const flat = merged.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  flat.sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")) || a.schoolName.localeCompare(b.schoolName, "ko-KR"));

  const out = {
    generatedAt: now.toISOString(),
    lookbackDays,
    schoolCount: activeSchools.length,
    hitCount: flat.length,
    keywords: KEYWORDS,
    items: flat
  };

  const newItems = flat.filter((item) => !state.seenIds[item.id]);
  for (const item of newItems) state.seenIds[item.id] = now.toISOString();

  await writeFile(join(dataDir, "school_notice_hits.json"), `${JSON.stringify(out, null, 2)}\n`, "utf-8");
  await writeFile(
    join(dataDir, "school_notice_new.json"),
    `${JSON.stringify({ generatedAt: now.toISOString(), newCount: newItems.length, items: newItems }, null, 2)}\n`,
    "utf-8"
  );
  await writeFile(join(dataDir, "school_notice_state.json"), `${JSON.stringify({ updatedAt: now.toISOString(), seenIds: state.seenIds }, null, 2)}\n`, "utf-8");

  console.log(`Scanned ${activeSchools.length} schools. Found ${flat.length} matching posts (lookback ${lookbackDays}d).`);
  console.log(`New: ${newItems.length}`);
  console.log(`Saved: data/school_notice_hits.json, data/school_notice_new.json, data/school_notice_state.json`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
