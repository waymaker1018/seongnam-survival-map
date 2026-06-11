// 1) 서울교육청 웹사이트 안내에서 11개 교육지원청 도메인 추출
// 2) 서부 JOL11.do 구인 게시판 목록·상세 구조 확인
const UA = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" };

console.log("===== 교육지원청 도메인 =====");
try {
  const response = await fetch("https://www.sen.go.kr/www/website.jsp", { headers: UA });
  const html = await response.text();
  const domains = new Set();
  for (const m of html.matchAll(/https?:\/\/([a-z0-9-]+)\.sen\.go\.kr/gi)) domains.add(m[1]);
  console.log([...domains].join(", "));
} catch (error) { console.log("실패:", error.message); }

console.log("\n===== 서부 JOL11.do 구조 =====");
const response = await fetch("https://sbedu.sen.go.kr/FUS/JO/JOL11.do", { headers: UA });
const html = await response.text();
console.log("HTTP", response.status, "길이:", html.length);
// 목록 항목 주변 마크업
const idx = html.indexOf("fncDetailView");
console.log("--- fncDetailView 주변 1200자 ---");
console.log(html.slice(Math.max(0, idx - 700), idx + 500).replace(/\s+/g, " "));
// 함수 정의
const fn = html.match(/function\s+fncDetailView[\s\S]{0,400}/);
console.log("--- 함수 정의 ---");
console.log(fn ? fn[0].replace(/\s+/g, " ").slice(0, 400) : "본문에 없음(외부 js)");
