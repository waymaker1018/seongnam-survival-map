// 공고 링크들의 실제 도착지 확인 — 구글로 리다이렉트되는 링크 찾기
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const targets = [];
for (const file of ["seoul_notice_hits.json", "training_hits.json"]) {
  const json = JSON.parse(await readFile(join(dataDir, file), "utf-8"));
  for (const item of json.items) targets.push({ from: file, title: item.title.slice(0, 40), url: item.url });
}
// 교육부 공고 상세 URL 형식 검증용 1건 추가됨(training에 포함)

const seen = new Set();
for (const t of targets) {
  if (seen.has(t.url)) continue;
  seen.add(t.url);
  try {
    const response = await fetch(t.url, {
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" }
    });
    const finalUrl = response.url;
    const marker = /google/i.test(finalUrl) ? " ◀◀◀ 구글!" : "";
    const moved = new URL(finalUrl).hostname !== new URL(t.url).hostname ? " [도메인 변경]" : "";
    console.log(`${response.status}${moved}${marker} | ${t.title}\n    ${t.url}\n    → ${finalUrl}`);
  } catch (error) {
    console.log(`오류 | ${t.title}\n    ${t.url}\n    → ${error.message}`);
  }
  await new Promise((r) => setTimeout(r, 600));
}
