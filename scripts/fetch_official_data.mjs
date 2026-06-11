import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");

const SCHOOL_SOURCE =
  "https://www.goesn.kr/goesn/cm/cntnts/cntntsView.do?cntntsId=4406&mi=23643";
const RECRUITMENT_SOURCE =
  "https://www.goesn.kr/goesn/na/ntt/selectNttList.do";
const TRANSIT_ORIGIN = "";
const RECRUITMENT_BASE_PARAMS = {
  bbsId: "17872",
  mi: "23603",
  searchType: "sj",
  searchValue: "방과후",
  listCo: "50"
};

const now = new Date();
const checkedAt = now.toISOString();
const defaultYears = [now.getFullYear() - 3, now.getFullYear() - 2, now.getFullYear() - 1];
const targetYears = parseYears(process.argv.find((arg) => arg.startsWith("--years="))) || defaultYears;
const maxPages = Number(process.argv.find((arg) => arg.startsWith("--max-pages="))?.split("=")[1] || 90);
const includeDetails = process.argv.includes("--with-details");

function parseYears(arg) {
  if (!arg) return null;
  const years = arg
    .split("=")[1]
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value));
  return years.length ? years : null;
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#40;/g, "(")
    .replace(/&#41;/g, ")")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
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

function slugFromHomepage(homepage, name) {
  try {
    const host = new URL(homepage.trim()).hostname;
    return host.split(".")[0].replace(/[^a-z0-9-]/gi, "").toLowerCase();
  } catch {
    return name.replace(/\s+/g, "-");
  }
}

function mapUrls(name, fullAddress) {
  const query = `${fullAddress} ${name}`;
  return {
    naverMapUrl: `https://map.naver.com/p/search/${encodeURIComponent(query)}`,
    kakaoMapUrl: `https://map.kakao.com/link/search/${encodeURIComponent(query)}`
  };
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 Codex local data collector",
      accept: "text/html,application/xhtml+xml"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status}: ${url}`);
  }
  return response.text();
}

async function collectSchools() {
  const html = await fetchText(SCHOOL_SOURCE);
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1];
  if (!tbody) throw new Error("Could not find school table body.");

  const schools = [];
  for (const rowMatch of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => match[1]);
    if (cells.length < 4) continue;

    const link = cells[0].match(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    const rawName = cleanHtml(link?.[2] || cells[0]);
    const statusMatch = rawName.match(/\((휴교|폐교)\)/);
    const name = rawName.replace(/\s*\((휴교|폐교)\)\s*/g, "").trim();
    const homepage = decodeEntities(link?.[1] || "").trim();
    const phone = cleanHtml(cells[1]);
    const fax = cleanHtml(cells[2]);
    const address = cleanHtml(cells[3]);
    const district = address.match(/(수정구|중원구|분당구)/)?.[1] || "미분류";
    const fullAddress = address.startsWith("경기도") ? address : `경기도 성남시 ${address}`;
    const urls = mapUrls(name, fullAddress);

    schools.push({
      id: slugFromHomepage(homepage, name),
      name,
      rawName,
      sortName: name,
      status: statusMatch?.[1] || "운영",
      district,
      address,
      fullAddress,
      phone,
      fax,
      homepage,
      ...urls,
      transitOrigin: TRANSIT_ORIGIN,
      transitMinutes: null,
      transitStatus: "확인필요",
      sourceUrl: SCHOOL_SOURCE,
      sourceCheckedAt: checkedAt
    });
  }

  schools.sort((a, b) => a.sortName.localeCompare(b.sortName, "ko-KR"));
  return schools;
}

function paramsToUrl(params) {
  const url = new URL(RECRUITMENT_SOURCE);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

function parseBoardRows(html) {
  const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1] || "";
  const rows = [];

  for (const rowMatch of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    const id = row.match(/data-id="(\d+)"/i)?.[1];
    if (!id) continue;

    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((match) => cleanHtml(match[1]));
    if (cells.length < 6) continue;

    rows.push({
      sourcePostId: id,
      boardNumber: cells[0],
      title: cells[1],
      deadlineDate: normalizeDate(cells[2]),
      schoolName: cells[3],
      postedDate: normalizeDate(cells[4]),
      views: Number(cells[5].replace(/[^\d]/g, "")) || null,
      sourceUrl: `https://www.goesn.kr/goesn/na/ntt/selectNttInfo.do?mi=23603&bbsId=17872&nttSn=${id}`
    });
  }

  return rows;
}

function normalizeDate(value) {
  const trimmed = String(value || "").trim();
  const match = trimmed.match(/(20\d{2})[./-](\d{1,2})[./-](\d{1,2})/);
  if (!match) return trimmed || null;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function normalizeSchoolKey(name) {
  return String(name || "").replace(/\s+/g, "").replace(/\((휴교|폐교)\)/g, "");
}

function inferRecruitmentYear(text, row) {
  const schoolYear = text.match(/(20\d{2})\s*학년도/);
  if (schoolYear) return Number(schoolYear[1]);
  const date = row.deadlineDate || row.postedDate;
  const year = date?.match(/^(20\d{2})/)?.[1];
  return year ? Number(year) : null;
}

function inferProviderType(text) {
  if (/업체|위탁\s*운영|운영\s*업체|용역|입찰|제안서|낙찰|계약상대자/.test(text)) return "업체/기관";
  if (/개인위탁|외부강사|강사|자원봉사자|보조강사/.test(text)) return "개인강사";
  return "미분류";
}

function extractVendorNames(text) {
  const names = new Set();
  const patterns = [
    /(?:업체명|기관명|낙찰자|계약상대자|참여업체)\s*[:：]?\s*([^\n]{2,50})/g,
    /(\(?주\)?\s*[가-힣A-Za-z0-9][가-힣A-Za-z0-9\s&.-]{1,35})/g
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const name = match[1]
        .replace(/\s+/g, " ")
        .replace(/[,:;，。].*$/, "")
        .trim();
      if (name.length >= 2 && name.length <= 40) names.add(name);
    }
  }

  return [...names].slice(0, 8);
}

function sectionAfter(text, pattern) {
  const index = text.search(pattern);
  if (index < 0) return "";
  return text.slice(index, index + 1400);
}

function extractProgramsAndCount(title, detailText) {
  const text = `${title}\n${detailText}`;
  const block =
    sectionAfter(text, /모집\s*(분야|부서|프로그램|강좌)|채용\s*(분야|부서)|운영\s*프로그램/) ||
    text.slice(0, 1600);
  const programs = [];

  for (const match of block.matchAll(/([가-힣A-Za-z0-9·ㆍ+\-/\s]{2,30})\s*(?:강사|부서|프로그램)?\s*(\d{1,2})\s*명/g)) {
    const name = match[1].replace(/\s+/g, " ").trim();
    const count = Number(match[2]);
    if (count > 0 && count < 30 && !/[년월일시분초]|제\s*\d|붙임|첨부/.test(name)) {
      programs.push({ name, slotCount: count, confidence: "중간" });
    }
  }

  if (programs.length) {
    const unique = dedupePrograms(programs);
    return {
      programs: unique,
      slotCount: unique.reduce((sum, item) => sum + (item.slotCount || 0), 0),
      confidence: "중간"
    };
  }

  const paren = title.match(/[[(（]([^()[\]（）]{2,120})[\])）]/);
  if (paren) {
    const names = paren[1]
      .split(/,|，|\/|·|ㆍ|및|와|과/)
      .map((value) => value.replace(/\s+/g, " ").trim())
      .filter((value) => value.length > 1 && !/공고|모집|재공고|방과후|학교/.test(value));
    if (names.length) {
      return {
        programs: names.map((name) => ({ name, slotCount: 1, confidence: "낮음" })),
        slotCount: names.length,
        confidence: "낮음"
      };
    }
  }

  const countMatch = block.match(/(?:총|모집\s*인원|채용\s*인원)[^\d]{0,20}(\d{1,2})\s*명/);
  if (countMatch) {
    return {
      programs: [],
      slotCount: Number(countMatch[1]),
      confidence: "낮음"
    };
  }

  return { programs: [], slotCount: null, confidence: "미확인" };
}

function dedupePrograms(programs) {
  const byName = new Map();
  for (const program of programs) {
    const key = program.name.replace(/\s+/g, "");
    if (!byName.has(key)) byName.set(key, program);
  }
  return [...byName.values()].slice(0, 20);
}

async function collectRecruitments(schools) {
  const schoolByKey = new Map(schools.map((school) => [normalizeSchoolKey(school.name), school]));
  const minTargetYear = Math.min(...targetYears);
  const rows = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const html = await fetchText(paramsToUrl({ ...RECRUITMENT_BASE_PARAMS, currPage: String(page) }));
    const pageRows = parseBoardRows(html);
    if (!pageRows.length) break;
    rows.push(...pageRows);
    console.log(`Fetched recruitment list page ${page}: ${pageRows.length} rows.`);

    const oldestPostedYear = Math.min(
      ...pageRows
        .map((row) => Number(row.postedDate?.slice(0, 4)))
        .filter((year) => Number.isInteger(year))
    );
    if (oldestPostedYear && oldestPostedYear < minTargetYear - 1) break;
  }

  const filteredRows = rows.filter((row) => {
    const school = schoolByKey.get(normalizeSchoolKey(row.schoolName));
    if (!school) return false;
    const postedYear = Number(row.postedDate?.slice(0, 4));
    return !postedYear || postedYear >= minTargetYear - 1;
  });

  const recruitments = [];
  for (const row of filteredRows) {
    const school = schoolByKey.get(normalizeSchoolKey(row.schoolName));
    let detailText = "";
    if (includeDetails) {
      try {
        detailText = cleanHtml(await fetchText(row.sourceUrl));
      } catch (error) {
        detailText = "";
      }
    }

    const combinedText = `${row.title}\n${detailText}`;
    const recruitmentYear = inferRecruitmentYear(combinedText, row);
    if (!targetYears.includes(recruitmentYear)) continue;

    const providerType = inferProviderType(combinedText);
    const vendorNames = providerType === "업체/기관" ? extractVendorNames(combinedText) : [];
    const countInfo = extractProgramsAndCount(row.title, detailText);

    recruitments.push({
      id: `goesn-${row.sourcePostId}`,
      schoolId: school.id,
      schoolName: school.name,
      recruitmentYear,
      title: row.title,
      postedDate: row.postedDate,
      deadlineDate: row.deadlineDate,
      providerType,
      slotCount: countInfo.slotCount,
      slotCountConfidence: countInfo.confidence,
      programs: countInfo.programs,
      vendorNames,
      verificationStatus: vendorNames.length || countInfo.confidence === "중간" ? "검증필요" : "원문확인필요",
      sourceUrl: row.sourceUrl,
      sourceBoard: "경기도성남교육지원청 구인",
      sourcePostId: row.sourcePostId,
      notes: includeDetails
        ? "자동 수집. 인원/업체명은 원문 공고 확인 후 확정하세요."
        : "목록 기반 자동 수집. 원문 본문은 저장하지 않았고, 앱의 출처 링크에서 확인하세요."
    });
  }

  recruitments.sort((a, b) => {
    const schoolCompare = a.schoolName.localeCompare(b.schoolName, "ko-KR");
    if (schoolCompare) return schoolCompare;
    return b.recruitmentYear - a.recruitmentYear || String(b.postedDate).localeCompare(String(a.postedDate));
  });

  return recruitments;
}

async function main() {
  await mkdir(dataDir, { recursive: true });

  const schools = await collectSchools();
  const recruitments = await collectRecruitments(schools);
  const meta = {
    generatedAt: checkedAt,
    schoolSource: SCHOOL_SOURCE,
    recruitmentSource: `${RECRUITMENT_SOURCE}?bbsId=17872&mi=23603`,
    recruitmentYears: targetYears,
    schoolCount: schools.length,
    recruitmentCount: recruitments.length,
    notes: [
      "School list is parsed from the official Seongnam Office of Education elementary-school status table.",
      "Recruitment records are parsed from the official Seongnam Office of Education hiring board with the keyword 방과후.",
      includeDetails
        ? "Recruitment detail pages were fetched for heuristic slot/vendor extraction."
        : "Recruitment detail pages were not fetched. Run with --with-details for slower heuristic slot/vendor extraction.",
      "Counts and vendor names are heuristic and must be verified against each source notice before business decisions."
    ]
  };

  await writeFile(join(dataDir, "schools.json"), `${JSON.stringify(schools, null, 2)}\n`, "utf-8");
  await writeFile(join(dataDir, "schools.csv"), makeSchoolsCsv(schools), "utf-8");
  await writeFile(join(dataDir, "recruitments.json"), `${JSON.stringify(recruitments, null, 2)}\n`, "utf-8");
  await writeFile(join(dataDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
  await writeFile(
    join(dataDir, "embedded-data.js"),
    `window.SEONGNAM_LIFEMAP_DATA = ${JSON.stringify({ schools, recruitments, meta }, null, 2)};\n`,
    "utf-8"
  );

  console.log(`Collected ${schools.length} schools.`);
  console.log(`Collected ${recruitments.length} recruitment events for years ${targetYears.join(", ")}.`);
}

function makeSchoolsCsv(items) {
  const rows = [
    ["학교명", "상태", "구", "주소", "전화번호", "팩스", "홈페이지", "대중교통분", "대중교통상태", "네이버지도", "카카오맵", "공식출처"],
    ...items.map((school) => [
      school.name,
      school.status,
      school.district,
      school.fullAddress,
      school.phone,
      school.fax,
      school.homepage,
      school.transitMinutes ?? "",
      school.transitStatus ?? "확인필요",
      school.naverMapUrl,
      school.kakaoMapUrl,
      school.sourceUrl
    ])
  ];
  return toExcelCsv(rows);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toExcelCsv(rows) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
