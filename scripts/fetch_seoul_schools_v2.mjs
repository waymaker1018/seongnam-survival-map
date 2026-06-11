// 서울 초등학교 데이터 구축 v2 — Overpass(이름+좌표) + NEIS(연락처) + Nominatim(동)
// 키 불필요. 중간 결과를 seoul_build_cache.json에 저장해 재실행 시 이어서 진행.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const cachePath = join(dataDir, "seoul_build_cache.json");
const outPath = join(dataDir, "seoul_schools.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "seongnam-survival-app/1.0 (personal school-job monitor)";

// 서울 경계 박스
const BOUNDS = { latMin: 37.41, latMax: 37.72, lngMin: 126.76, lngMax: 127.19 };

async function loadCache() {
  try { return JSON.parse(await readFile(cachePath, "utf-8")); } catch { return { osm: null, neis: {}, dong: {} }; }
}
const cache = await loadCache();
async function saveCache() { await writeFile(cachePath, JSON.stringify(cache), "utf-8"); }

// ── 1단계: Overpass — 서울 초등학교 이름+좌표 ──
if (!cache.osm) {
  // area 조회 대신 bbox — 훨씬 가볍고 빠름. 경계 밖 인접 도시 학교는 NEIS(B10) 매칭에서 걸러짐.
  const bbox = `${BOUNDS.latMin},${BOUNDS.lngMin},${BOUNDS.latMax},${BOUNDS.lngMax}`;
  const query = `[out:json][timeout:60];
(node["amenity"="school"](${bbox});way["amenity"="school"](${bbox});relation["amenity"="school"](${bbox}););
out center tags;`;
  const mirrors = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter"
  ];
  let json = null;
  for (const mirror of mirrors) {
    try {
      const response = await fetch(mirror, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query)
      });
      if (response.ok) { json = await response.json(); break; }
      console.error(`${mirror} → HTTP ${response.status}`);
    } catch (error) {
      console.error(`${mirror} → ${error.message}`);
    }
    await sleep(3000);
  }
  if (!json) throw new Error("모든 Overpass 미러 실패");
  const seen = new Set();
  cache.osm = [];
  for (const el of json.elements) {
    const name = (el.tags?.name || "").trim();
    if (!/초등학교$/.test(name)) continue;
    if (/병설|부설유치원/.test(name)) continue;
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!lat || !lng) continue;
    if (lat < BOUNDS.latMin || lat > BOUNDS.latMax || lng < BOUNDS.lngMin || lng > BOUNDS.lngMax) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    cache.osm.push({ name, lat, lng });
  }
  await saveCache();
  console.log(`1단계 Overpass: ${cache.osm.length}개교 (이름+좌표)`);
} else {
  console.log(`1단계 Overpass: 캐시 사용 (${cache.osm.length}개교)`);
}

// ── 2단계: NEIS — 학교명으로 주소·전화·홈페이지 (키 없이 1건씩) ──
// 주의: accept 헤더 보내면 500. 호출 간격 필수.
async function neisLookup(name) {
  const url = new URL("https://open.neis.go.kr/hub/schoolInfo");
  url.searchParams.set("Type", "json");
  url.searchParams.set("ATPT_OFCDC_SC_CODE", "B10");
  url.searchParams.set("SCHUL_NM", name);
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const json = await response.json();
        const rows = json.schoolInfo?.[1]?.row || [];
        // 초등학교이면서 이름이 정확히 일치(또는 포함)하는 행 선택
        return rows.find((r) => r.SCHUL_KND_SC_NM === "초등학교" && (r.SCHUL_NM === name || r.SCHUL_NM.includes(name) || name.includes(r.SCHUL_NM))) || null;
      }
    } catch {}
    await sleep(2500 * attempt);
  }
  return null;
}

let neisDone = 0;
let neisMiss = 0;
for (const school of cache.osm) {
  if (cache.neis[school.name] !== undefined) { neisDone += 1; continue; }
  const row = await neisLookup(school.name);
  cache.neis[school.name] = row ? {
    code: row.SD_SCHUL_CODE,
    officialName: row.SCHUL_NM.trim(),
    address: (row.ORG_RDNMA || "").trim() + (row.ORG_RDNDA ? ` ${row.ORG_RDNDA.trim()}` : ""),
    phone: (row.ORG_TELNO || "").trim(),
    fax: (row.ORG_FAXNO || "").trim(),
    homepage: (row.HMPG_ADRES || "").trim()
  } : null;
  if (!cache.neis[school.name]) neisMiss += 1;
  neisDone += 1;
  if (neisDone % 25 === 0) { await saveCache(); console.log(`2단계 NEIS: ${neisDone}/${cache.osm.length} (미매칭 ${neisMiss})`); }
  await sleep(1300);
}
await saveCache();
console.log(`2단계 NEIS 완료: ${neisDone}건 (미매칭 ${neisMiss})`);

// ── 3단계: Nominatim 역지오코딩 — 동(洞) ──
function pickDong(address) {
  if (!address) return null;
  for (const key of ["suburb", "quarter", "neighbourhood", "village", "borough"]) {
    const value = address[key];
    if (value && /[동가리]$/.test(value)) return value;
  }
  return null;
}

let dongDone = 0;
for (const school of cache.osm) {
  if (!cache.neis[school.name]) { dongDone += 1; continue; } // 서울 미매칭은 동 조회 불필요
  if (cache.dong[school.name] !== undefined) { dongDone += 1; continue; }
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("lat", String(school.lat));
    url.searchParams.set("lon", String(school.lng));
    url.searchParams.set("zoom", "14");
    url.searchParams.set("addressdetails", "1");
    const response = await fetch(url, { headers: { "user-agent": UA } });
    const json = response.ok ? await response.json() : null;
    cache.dong[school.name] = pickDong(json?.address) || null;
  } catch {
    cache.dong[school.name] = null;
  }
  dongDone += 1;
  if (dongDone % 50 === 0) { await saveCache(); console.log(`3단계 동: ${dongDone}/${cache.osm.length}`); }
  await sleep(1100);
}
await saveCache();

// ── 결합 → seoul_schools.json ──
const schools = [];
for (const school of cache.osm) {
  const neis = cache.neis[school.name];
  if (!neis) continue; // NEIS 미매칭(폐교·OSM 오기재 등)은 제외
  const address = neis.address;
  const districtMatch = address.match(/서울특별시\s+(\S+?구)/);
  schools.push({
    id: `sen-${neis.code}`,
    name: neis.officialName,
    sortName: neis.officialName,
    status: "운영",
    district: districtMatch ? districtMatch[1] : null,
    dong: cache.dong[school.name] || null,
    lat: school.lat,
    lng: school.lng,
    fullAddress: address,
    address: address.replace(/^서울특별시\s*/, ""),
    phone: neis.phone,
    fax: neis.fax,
    homepage: neis.homepage,
    naverMapUrl: `https://map.naver.com/p/search/${encodeURIComponent(address + " " + neis.officialName)}`,
    kakaoMapUrl: `https://map.kakao.com/link/search/${encodeURIComponent(address + " " + neis.officialName)}`,
    sourceUrl: "OSM Overpass + NEIS 교육정보 개방포털",
    sourceCheckedAt: new Date().toISOString()
  });
}
// 같은 NEIS 코드 중복 제거
const byCode = new Map();
for (const s of schools) if (!byCode.has(s.id)) byCode.set(s.id, s);
const finalSchools = [...byCode.values()].sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));
await writeFile(outPath, JSON.stringify(finalSchools, null, 2), "utf-8");

const withDistrict = finalSchools.filter((s) => s.district).length;
const withDong = finalSchools.filter((s) => s.dong).length;
const districts = new Set(finalSchools.map((s) => s.district).filter(Boolean));
console.log(`완료: ${finalSchools.length}개교 저장 (구 보유 ${withDistrict}, 동 보유 ${withDong}, 구 ${districts.size}개)`);
