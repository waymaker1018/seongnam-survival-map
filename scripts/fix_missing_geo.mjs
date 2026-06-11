// 지오코딩 누락분 보완 — 다양한 쿼리 변형 + 성남 경계 박스 제한 검색
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const schoolsPath = join(dataDir, "schools.json");
const cachePath = join(dataDir, "geocode_cache.json");

const BOUNDS = { latMin: 37.31, latMax: 37.51, lngMin: 127.0, lngMax: 127.22 };
// Nominatim viewbox: lng1,lat1,lng2,lat2
const VIEWBOX = `${BOUNDS.lngMin},${BOUNDS.latMax},${BOUNDS.lngMax},${BOUNDS.latMin}`;
const USER_AGENT = "seongnam-survival-app/1.0 (personal school-job monitor)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inBounds(lat, lng) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax;
}

function pickDong(address) {
  if (!address) return null;
  for (const key of ["suburb", "quarter", "neighbourhood", "village", "borough"]) {
    const value = address[key];
    if (value && /[동가리]$/.test(value)) return value;
  }
  return null;
}

async function query(q, bounded) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("viewbox", VIEWBOX);
  if (bounded) url.searchParams.set("bounded", "1");
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return [];
  const json = await response.json();
  await sleep(1100);
  return json;
}

async function reverseDong(lat, lng) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) return null;
  const json = await response.json();
  await sleep(1100);
  return pickDong(json?.address);
}

async function main() {
  const schools = JSON.parse(await readFile(schoolsPath, "utf-8"));
  const cache = JSON.parse(await readFile(cachePath, "utf-8"));

  for (const school of schools) {
    // 동만 누락된 경우: 역지오코딩 보완
    if (school.lat && !school.dong) {
      const dong = await reverseDong(school.lat, school.lng);
      if (dong) {
        school.dong = dong;
        if (cache[school.id]) cache[school.id].dong = dong;
        console.log(`동 보완: ${school.name} → ${dong}`);
      } else {
        console.log(`동 보완 실패: ${school.name}`);
      }
      continue;
    }
    if (school.lat) continue;

    // 좌표 누락: 쿼리 변형 시도 (학교명 단독 + 경계박스 제한, 도로명 변형)
    const street = school.address.replace(/^\S+구\s*/, "");
    const candidates = [
      { q: school.name, bounded: true },
      { q: `${street}, 성남시`, bounded: false },
      { q: street.replace(/(\d+)번길\s*\d+$/, "$1번길"), bounded: true }
    ];
    let found = null;
    for (const c of candidates) {
      const hits = await query(c.q, c.bounded);
      for (const hit of hits) {
        const lat = Number(hit.lat), lng = Number(hit.lon);
        if (inBounds(lat, lng)) { found = { lat, lng, dong: pickDong(hit.address) }; break; }
      }
      if (found) break;
    }
    if (found) {
      if (!found.dong) found.dong = await reverseDong(found.lat, found.lng);
      school.lat = found.lat;
      school.lng = found.lng;
      school.dong = found.dong || null;
      cache[school.id] = { ...found, method: "fix" };
      console.log(`좌표 보완: ${school.name} → ${found.lat.toFixed(5)}, ${found.lng.toFixed(5)} (${found.dong || "동 미확인"})`);
    } else {
      console.log(`좌표 보완 실패: ${school.name} — 수동 입력 필요`);
    }
  }

  await writeFile(schoolsPath, JSON.stringify(schools, null, 2), "utf-8");
  await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  const withCoords = schools.filter((s) => s.lat).length;
  const withDong = schools.filter((s) => s.dong).length;
  console.log(`최종 — 좌표: ${withCoords}/${schools.length}, 동: ${withDong}/${schools.length}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
