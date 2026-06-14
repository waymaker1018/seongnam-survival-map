// 동(dong)이 비어 있는 서울 학교 보강 — 좌표 역지오코딩 재시도 + 주소 괄호 법정동 fallback
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const schoolsPath = join(dataDir, "seoul_schools.json");
const UA = "seongnam-survival-app/1.0 (personal school-job monitor)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pickDong(address) {
  if (!address) return null;
  for (const key of ["suburb", "quarter", "neighbourhood", "village", "borough"]) {
    const value = address[key];
    if (value && /[동가리]$/.test(value)) return value;
  }
  return null;
}

// 주소 괄호 안 법정동 추출: "... (장지동)" / "... (가양동,양천초등학교)"
function dongFromAddress(fullAddress) {
  const m = String(fullAddress || "").match(/\(([^),]*?[동가리])(?:[,)]|$)/);
  return m ? m[1].trim() : null;
}

async function reverseDong(lat, lng) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "14");
  url.searchParams.set("addressdetails", "1");
  try {
    const response = await fetch(url, { headers: { "user-agent": UA } });
    if (!response.ok) return null;
    return pickDong((await response.json())?.address);
  } catch {
    return null;
  }
}

const schools = JSON.parse(await readFile(schoolsPath, "utf-8"));
const missing = schools.filter((s) => !s.dong);
console.log(`동 누락: ${missing.length}개교`);

for (const school of missing) {
  let dong = null;
  let how = "";
  if (school.lat && school.lng) {
    dong = await reverseDong(school.lat, school.lng);
    if (dong) how = "역지오코딩";
    await sleep(1100);
  }
  if (!dong) {
    dong = dongFromAddress(school.fullAddress);
    if (dong) how = "주소괄호";
  }
  if (dong) {
    school.dong = dong;
    school.dongApprox = how === "주소괄호"; // 법정동 fallback 표시
    console.log(`보강 [${how}] ${school.name} → ${dong}`);
  } else {
    console.log(`실패 ${school.name} — UI 안전망("(동 미상)")으로 노출됨`);
  }
}

await writeFile(schoolsPath, JSON.stringify(schools, null, 2), "utf-8");
const stillMissing = schools.filter((s) => !s.dong).length;
console.log(`완료 — 동 보유 ${schools.length - stillMissing}/${schools.length}, 잔여 ${stillMissing}`);
