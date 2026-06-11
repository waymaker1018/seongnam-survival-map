// 서울+성남 학교 홈페이지 전수 스캔 — 구글 등 다른 도메인으로 리다이렉트되는 곳 찾기
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const schools = [
  ...JSON.parse(await readFile(join(dataDir, "seoul_schools.json"), "utf-8")),
  ...JSON.parse(await readFile(join(dataDir, "schools.json"), "utf-8"))
];

const absolute = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`);
let scanned = 0, googleHits = 0, otherRedirects = 0, failures = 0;

const queue = [...schools];
const workers = Array.from({ length: 8 }, async () => {
  while (queue.length) {
    const school = queue.shift();
    if (!school.homepage) continue;
    const url = absolute(school.homepage);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(url, { redirect: "follow", signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } });
      clearTimeout(timer);
      const finalHost = new URL(response.url).hostname;
      if (/google\./i.test(finalHost)) {
        googleHits += 1;
        console.log(`◀◀ 구글! ${school.name}: ${url} → ${response.url}`);
      } else if (finalHost !== new URL(url).hostname) {
        otherRedirects += 1;
        console.log(`[도메인변경] ${school.name}: ${new URL(url).hostname} → ${finalHost}`);
      }
    } catch {
      failures += 1;
      console.log(`[접속실패] ${school.name}: ${url}`);
    }
    scanned += 1;
    if (scanned % 100 === 0) console.log(`--- ${scanned}/${schools.length} ---`);
  }
});
await Promise.all(workers);
console.log(`완료: ${scanned}곳 — 구글 ${googleHits}, 타도메인 ${otherRedirects}, 실패 ${failures}`);
