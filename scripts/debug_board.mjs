// 교육지원청 구인게시판 응답 구조 진단용 (1회성)
const url = "https://www.goesn.kr/goesn/na/ntt/selectNttList.do?bbsId=17872&mi=23603&listCo=50&currPage=1";
const response = await fetch(url, {
  headers: { "user-agent": "Mozilla/5.0 seongnam-after-school-map monitor", accept: "text/html" }
});
console.log("HTTP", response.status);
const html = await response.text();
console.log("길이:", html.length);
const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
console.log("tbody 존재:", !!tbody);
const links = [...html.matchAll(/selectNttInfo\.do\?[^"']*nttSn=(\d+)/g)];
console.log("nttSn 링크 수:", links.length);
const anchors = [...html.matchAll(/<a[^>]*nttSn[^>]*>([\s\S]*?)<\/a>/gi)].slice(0, 12);
for (const a of anchors) {
  console.log("제목:", a[1].replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim().slice(0, 80));
}
if (!tbody) console.log("--- 본문 앞 800자 ---\n" + html.slice(0, 800));
// 실제 행 마크업 확인 — 첫 tr 2개 원문 출력
const rows = [...(tbody?.[1] || "").matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 2);
for (const row of rows) console.log("--- TR ---\n" + row[1].replace(/\s+/g, " ").slice(0, 1500));
