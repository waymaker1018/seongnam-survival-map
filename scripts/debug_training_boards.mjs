// 양성교육 크롤링 대상 게시판 구조 진단 (1회성)
const targets = [
  { name: "디지털튜터포털 교육안내", url: "https://dt.kosac.re.kr/dt/prgrm/list/806?type=new" },
  { name: "디지털새싹", url: "https://www.xn--2z1bz5tdvbiwlf4j.com/" },
  { name: "교육부 공고(재시도)", url: "https://www.moe.go.kr/boardCnts/listRenew.do?boardID=294&m=020402&s=moe" }
];

for (const target of targets) {
  console.log(`\n===== ${target.name} =====`);
  try {
    const response = await fetch(target.url, {
      headers: { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", accept: "text/html" }
    });
    console.log("HTTP", response.status);
    const html = await response.text();
    console.log("길이:", html.length);
    // 목록 행 후보: tbody tr 또는 ul li 구조 샘플 출력
    const tbody = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];
    if (tbody) {
      const rows = [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].slice(0, 2);
      for (const row of rows) console.log("--- TR ---\n" + row[1].replace(/\s+/g, " ").slice(0, 1200));
    } else {
      // a 태그 중 상세보기로 보이는 것 샘플
      const anchors = [...html.matchAll(/<a[^>]{10,250}>[\s\S]{2,120}?<\/a>/gi)]
        .map((m) => m[0].replace(/\s+/g, " "))
        .filter((a) => /(view|View|detail|Info|seq|Seq|idx|nttSn|boardSeq)/.test(a))
        .slice(0, 4);
      console.log("tbody 없음 — 앵커 샘플:");
      for (const a of anchors) console.log("  " + a.slice(0, 300));
    }
  } catch (error) {
    console.log("오류:", error.message);
  }
}
