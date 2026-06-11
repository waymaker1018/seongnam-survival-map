// 학교 데이터 보강: 위도/경도 + 법정동(洞)
// Nominatim(OSM) 지오코딩 사용 — 키 불필요, 1초당 1요청 제한 준수.
// 결과는 data/geocode_cache.json에 캐시되어 재실행 시 네트워크 호출 없음.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, "..", "data");
const schoolsPath = join(dataDir, "schools.json");
const cachePath = join(dataDir, "geocode_cache.json");

// 성남시 대략 경계 — 이 범위 밖 결과는 오매칭으로 간주
const BOUNDS = { latMin: 37.31, latMax: 37.51, lngMin: 127.0, lngMax: 127.22 };
const NOMINATIM = "https://nominatim.openstreetmap.org";
const USER_AGENT = "seongnam-survival-app/1.0 (personal school-job monitor)";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function nominatim(path, params) {
  const url = new URL(`${NOMINATIM}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const response = await fetch(url, { headers: { "user-agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Nominatim ${response.status}: ${url}`);
  return response.json();
}

function inBounds(lat, lng) {
  return lat >= BOUNDS.latMin && lat <= BOUNDS.latMax && lng >= BOUNDS.lngMin && lng <= BOUNDS.lngMax;
}

// addressdetails에서 동 이름 추출 — OSM 한국 데이터는 suburb/quarter/neighbourhood에 동이 들어옴
function pickDong(address) {
  if (!address) return null;
  for (const key of ["suburb", "quarter", "neighbourhood", "village", "borough"]) {
    const value = address[key];
    if (value && /[동가리]$/.test(value)) return value;
  }
  return null;
}

async function searchSchool(school) {
  // 1차: 학교명 + 성남
  const byName = await nominatim("/search", {
    format: "jsonv2", q: `${school.name}, 성남시`, countrycodes: "kr", limit: 5, addressdetails: 1
  });
  await sleep(1100);
  for (const hit of byName) {
    const lat = Number(hit.lat), lng = Number(hit.lon);
    if (inBounds(lat, lng)) return { lat, lng, dong: pickDong(hit.address), method: "name" };
  }

  // 2차: 도로명주소
  const byAddress = await nominatim("/search", {
    format: "jsonv2", q: school.fullAddress, countrycodes: "kr", limit: 5, addressdetails: 1
  });
  await sleep(1100);
  for (const hit of byAddress) {
    const lat = Number(hit.lat), lng = Number(hit.lon);
    if (inBounds(lat, lng)) return { lat, lng, dong: pickDong(hit.address), method: "address" };
  }
  return null;
}

// 좌표는 있는데 동을 못 얻었으면 역지오코딩으로 보완
async function reverseDong(lat, lng) {
  const hit = await nominatim("/reverse", { format: "jsonv2", lat, lon: lng, zoom: 14, addressdetails: 1 });
  await sleep(1100);
  return pickDong(hit?.address);
}

async function main() {
  const schools = JSON.parse(await readFile(schoolsPath, "utf-8"));
  let cache = {};
  try { cache = JSON.parse(await readFile(cachePath, "utf-8")); } catch {}

  const failures = [];
  let fetched = 0;

  for (const school of schools) {
    if (cache[school.id]?.lat) continue; // 캐시 히트 — 호출 생략

    try {
      const found = await searchSchool(school);
      if (!found) { failures.push(school.name); continue; }
      if (!found.dong) found.dong = await reverseDong(found.lat, found.lng);
      cache[school.id] = found;
      fetched += 1;
      console.log(`OK [${found.method}] ${school.name} → ${found.lat.toFixed(5)}, ${found.lng.toFixed(5)} (${found.dong || "동 미확인"})`);
    } catch (error) {
      failures.push(school.name);
      console.error(`FAIL ${school.name}: ${error.message}`);
    }
    // 중간 저장 — 중단돼도 진행분 보존
    await writeFile(cachePath, JSON.stringify(cache, null, 2), "utf-8");
  }

  // schools.json에 병합
  const enriched = schools.map((school) => {
    const geo = cache[school.id];
    return geo ? { ...school, lat: geo.lat, lng: geo.lng, dong: geo.dong || school.dong || null } : school;
  });
  await writeFile(schoolsPath, JSON.stringify(enriched, null, 2), "utf-8");

  const withCoords = enriched.filter((s) => s.lat).length;
  const withDong = enriched.filter((s) => s.dong).length;
  console.log(`\n좌표 보유: ${withCoords}/${schools.length}, 동 보유: ${withDong}/${schools.length} (신규 호출 ${fetched}건)`);
  if (failures.length) console.log(`실패 목록: ${failures.join(", ")}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
