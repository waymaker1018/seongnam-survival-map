// 서울 채용공고 소스 구조 진단 (1회성)
const targets = [
  { name: "서울교육일자리포털 메인", url: "https://work.sen.go.kr/work/index.do" },
  { name: "방과후지원센터 구인 목록", url: "https://afterschool.sen.go.kr/web/afsc/noti/bordContList.do?brd_no=1" },
  { name: "서부교육지원청 구인구직", url: "https://sbedu.sen.go.kr/FUS/JO/JOL11.do" }
];

for (const target of targets) {
  console.log(`\n===== ${target.name} =====`);
  try {
    const response = await fetch(target.url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "accept-language": "ko-KR,ko;q=0.9" }
    });
    console.log("HTTP", response.status, "| 최종 URL:", response.url);
    const html = await response.text();
    console.log("길이:", html.length);
    const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
    if (tbody && tbody.trim().length > 50) {
      const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 2);
      for (const row of rows) console.log("--- TR ---\n" + row[1].replace(/\s+/g, " ").slice(0, 1000));
    } else {
      // 공고/채용 관련 링크 샘플
      const anchors = [...html.matchAll(/<a[^>]{5,300}>[\s\S]{2,100}?<\/a>/gi)]
        .map((m) => m[0].replace(/\s+/g, " "))
        .filter((a) => /(공고|채용|구인|모집|recruit|emp|job)/i.test(a))
        .slice(0, 6);
      console.log("tbody 부실 — 관련 앵커:");
      for (const a of anchors) console.log("  " + a.slice(0, 250));
    }
  } catch (error) {
    console.log("오류:", error.message);
  }
  await new Promise((r) => setTimeout(r, 1000));
}
