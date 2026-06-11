import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const dataDir = join(root, "data");
const checkedAt = new Date().toISOString();
const sourceUrl = "https://www.goesn.kr/goesn/cm/cntnts/cntntsView.do?cntntsId=4406&mi=23643";
const transitOrigin = "";

const rows = [
  ["검단초등학교", "https://gomdan-e.goesn.kr", "031-753-4762", "031-753-4765", "중원구 원터로 25"],
  ["구미초등학교", "https://kumi-e.goesn.kr", "031-714-2072", "031-714-2075", "분당구 미금로22번길 25"],
  ["금빛초등학교", "https://geumbit-e.goesn.kr", "031-755-0461", "031-722-5543", "수정구 남문로 112"],
  ["금상초등학교", "https://gumsang-e.goesn.kr", "031-733-5025", "031-735-9859", "중원구 금상로 97"],
  ["낙생초등학교", "https://naksaeng-e.goesn.kr", "031-781-5613", "031-781-5616", "분당구 서판교로74번길 11"],
  ["내정초등학교", "https://naejeong-e.goesn.kr", "031-711-1905", "031-711-1908", "분당구 내정로174번길 19"],
  ["늘푸른초등학교", "https://npr-e.goesn.kr", "031-789-6100", "031-711-3313", "분당구 정자일로 87"],
  ["단남초등학교", "https://dannam-e.goesn.kr", "031-741-2189", "031-745-4774", "중원구 광명로300번길 25"],
  ["단대초등학교", "https://dandae-e.goesn.kr", "031-741-2018", "031-741-2017", "수정구 단대로 30"],
  ["당촌초등학교", "https://dangchon-e.goesn.kr", "031-702-4006", "031-702-4009", "분당구 분당로 196"],
  ["대원초등학교(휴교)", "https://dw-e.goesn.kr", "031-746-9372", "031-746-9373", "중원구 희망로343번길 24"],
  ["대일초등학교", "https://daeil-e.goesn.kr", "031-749-6777", "031-749-0770", "중원구 금상로58번길 22"],
  ["대하초등학교", "https://daeha-e.goesn.kr", "031-752-9442", "031-753-1795", "중원구 시민로 14"],
  ["도촌초등학교", "https://sdc-e.goesn.kr", "031-755-0682", "031-755-0689", "중원구 도촌남로 99"],
  ["돌마초등학교", "https://dolma-e.goesn.kr", "031-704-3608", "031-706-2035", "분당구 야탑로 96-7"],
  ["백현초등학교", "https://baekhyeon-e.goesn.kr", "031-713-1272", "031-713-1275", "분당구 백현로144번길 26"],
  ["보평초등학교", "https://bp-e.goesn.kr", "031-697-2106", "031-8017-3104", "분당구 동판교로 154"],
  ["복정초등학교", "https://bokjeong-e.goesn.kr", "031-759-5623", "031-759-5120", "수정구 성남대로1480번길 25"],
  ["분당초등학교", "https://bundang-e.goesn.kr", "031-701-2398", "031-701-2397", "분당구 중앙공원로32번길 20"],
  ["불곡초등학교", "https://bulgok-e.goesn.kr", "031-716-0143", "031-716-0145", "분당구 무지개로 129"],
  ["불정초등학교", "https://buljung-e.goesn.kr", "031-713-0453", "031-713-0455", "분당구 돌마로 250"],
  ["산운초등학교", "https://sanun-e.goesn.kr", "031-8016-3001", "031-8016-3004", "분당구 판교원로117번길 11"],
  ["상대원초등학교", "https://sangdaewon-e.goesn.kr", "031-736-7414", "031-736-7415", "중원구 순환로214번길 16"],
  ["상원초등학교", "https://sangwon-e.goesn.kr", "031-741-2197", "031-744-5262", "중원구 은행로 6"],
  ["상탑초등학교", "https://sangtap-e.goesn.kr", "031-706-4123", "031-706-4125", "분당구 판교로 647"],
  ["서당초등학교", "https://seodang-e.goesn.kr", "031-701-2663", "031-701-2666", "분당구 돌마로476번길 30"],
  ["서현초등학교", "https://seohyeon-e.goesn.kr", "031-701-2171", "031-701-2172", "분당구 중앙공원로39번길 12"],
  ["성남동초등학교", "https://snd-e.goesn.kr", "031-746-9456", "070-4032-2325", "중원구 자혜로32번길 10"],
  ["성남매송초등학교", "https://snms-e.goesn.kr", "070-4346-5600", "031-703-0774", "분당구 탄천로 97"],
  ["성남미금초등학교", "https://snmg-e.goesn.kr", "031-714-0092", "031-714-0095", "분당구 미금로 151"],
  ["성남북초등학교", "https://snb-e.goesn.kr", "031-746-7701", "031-749-4529", "수정구 희망로534번길 3"],
  ["성남서초등학교", "https://seongnamseo-e.goesn.kr", "031-753-5701", "031-754-0905", "수정구 태평로 19"],
  ["성남송현초등학교", "https://snsonghyeon-e.goesn.kr", "031-8016-2002", "031-8016-2005", "분당구 동판교로 258"],
  ["성남수정초등학교", "https://snsj-e.goesn.kr", "031-757-1584", "031-721-5047", "수정구 제일로123번길 9"],
  ["성남신기초등학교", "https://snsg-e.goesn.kr", "031-713-3691", "031-713-1589", "분당구 황새울로 74"],
  ["성남신흥초등학교", "https://snsh-e.goesn.kr", "031-744-5456", "031-744-5458", "수정구 공원로436번길 17"],
  ["성남양지초등학교", "https://snyj-e.goesn.kr", "031-733-1797", "031-733-1424", "수정구 논골로36번길 33"],
  ["성남여수초등학교", "https://snys-e.goesn.kr", "031-757-6905", "031-757-6908", "중원구 여수울로 37"],
  ["성남은행초등학교", "https://sneh-e.goesn.kr", "031-734-0514", "031-747-0683", "중원구 순환로447번길 11"],
  ["성남장안초등학교", "https://snjangan-e.goesn.kr", "031-701-7075", "031-701-7076", "분당구 장안로51번길 10"],
  ["성남정자초등학교", "https://snjj-e.goesn.kr", "031-711-5197", "031-711-4378", "분당구 분당수서로 442"],
  ["성남제일초등학교", "https://snji-e.goesn.kr", "031-746-6712", "031-734-6317", "중원구 광명로184번길 23"],
  ["성남중앙초등학교", "https://snjungang-e.goesn.kr", "031-754-4413", "031-754-3964", "중원구 원터로94번길 7"],
  ["성남초등학교", "https://sn-e.goesn.kr", "031-755-1129", "031-755-1432", "수정구 수정로 233"],
  ["성남화랑초등학교", "https://hwarang-e.goesn.kr", "031-703-2600", "031-703-4433", "분당구 동판교로 77"],
  ["성수초등학교", "https://seongsu-e.goesn.kr", "031-752-9603", "031-755-3947", "수정구 모란로 11"],
  ["수내초등학교", "https://sunae-e.goesn.kr", "031-711-2152", "031-711-2154", "분당구 백현로243번길 12"],
  ["수진초등학교", "https://sujin-e.goesn.kr", "031-756-2187", "031-756-2185", "수정구 탄리로95번길 16"],
  ["신백현초등학교", "https://shinbh-e.goesn.kr", "031-8017-2071", "031-8017-2075", "분당구 판교역로14번길 42"],
  ["안말초등학교", "https://anmal-e.goesn.kr", "031-704-6161", "031-704-6162", "분당구 양현로 104"],
  ["야탑초등학교", "https://yatap-e.goesn.kr", "031-781-3323", "031-704-8195", "분당구 양현로 400"],
  ["양영초등학교", "https://yy-e.goesn.kr", "031-707-0123", "031-707-0125", "분당구 불정로406번길 17"],
  ["오리초등학교", "https://ori-e.goesn.kr", "031-714-0672", "031-714-0675", "분당구 미금로 121"],
  ["왕남초등학교", "https://wang-e.goesn.kr", "031-723-7150", "031-723-8422", "수정구 왕남로 24"],
  ["운중초등학교", "https://uj-e.goesn.kr", "031-781-5482", "031-781-5487", "분당구 운중로45번길 8"],
  ["위례고운초등학교", "https://wrgoun-e.goesn.kr", "031-751-9343", "031-751-9399", "수정구 위례순환로 155"],
  ["위례중앙초등학교", "https://wrjungang-e.goesn.kr", "031-759-9060", "031-759-9061", "수정구 위례순환로 71"],
  ["위례푸른초등학교", "https://wiryepureun-e.goesn.kr", "031-757-6517", "031-755-4445", "수정구 위례순환로 205"],
  ["위례한빛초등학교", "https://whb-e.goesn.kr", "031-759-9673", "031-759-9672", "수정구 위례동로 55"],
  ["위례해솔초등학교", "https://wrhs-e.goesn.kr", "031-759-6701", "031-759-6704", "수정구 남위례로 131"],
  ["이매초등학교", "https://imae-e.goesn.kr", "031-704-4086", "031-704-4089", "분당구 양현로 146"],
  ["중부초등학교", "https://jungbu-e.goesn.kr", "031-730-7104", "031-733-4494", "중원구 자혜로 55"],
  ["중원초등학교", "https://joongwon-e.goesn.kr", "031-743-6480", "031-743-6482", "중원구 사기막골로31번길 46"],
  ["중탑초등학교", "https://jungtap-e.goesn.kr", "031-705-5854", "031-705-5855", "분당구 벌말로 68"],
  ["청솔초등학교", "https://chungsol-e.goesn.kr", "031-713-0742", "031-713-0745", "분당구 금곡로 243"],
  ["초림초등학교", "https://chorim-e.goesn.kr", "031-711-2102", "031-711-2104", "분당구 수내로90번길 26"],
  ["탄천초등학교", "https://tanchun-e.goesn.kr", "031-714-0761", "031-714-0764", "분당구 내정로 20"],
  ["태평초등학교", "https://tp-e.goesn.kr", "031-753-9473", "031-753-9475", "수정구 남문로32번길 7"],
  ["판교초등학교", "https://pangyo-e.goesn.kr", "031-8017-0429", "031-8017-0575", "분당구 판교원로 231"],
  ["판교대장초등학교", "https://pangyodaejang-e.goesn.kr", "031-724-0710", "031-719-6902", "분당구 판교대장로5길 71"],
  ["하원초등학교", "https://hw-e.goesn.kr", "031-731-6073", "031-731-6075", "중원구 광명로 396"],
  ["하탑초등학교", "https://hatap-e.goesn.kr", "031-705-0981", "031-705-0985", "분당구 양현로 262"],
  ["한솔초등학교", "https://hs-e.goesn.kr", "031-713-0362", "031-713-0365", "분당구 돌마로 303"],
  ["희망대초등학교", "https://hmd-e.goesn.kr", "031-732-4114", "031-731-5506", "수정구 공원로370번길 29"]
];

function idFromHomepage(homepage) {
  return new URL(homepage).hostname.split(".")[0].toLowerCase();
}

function mapUrls(name, fullAddress) {
  const query = `${fullAddress} ${name}`;
  return {
    naverMapUrl: `https://map.naver.com/p/search/${encodeURIComponent(query)}`,
    kakaoMapUrl: `https://map.kakao.com/link/search/${encodeURIComponent(query)}`
  };
}

const schools = rows
  .map(([rawName, homepage, phone, fax, address]) => {
    const statusMatch = rawName.match(/\((휴교|폐교)\)/);
    const name = rawName.replace(/\s*\((휴교|폐교)\)\s*/g, "").trim();
    const district = address.match(/(수정구|중원구|분당구)/)?.[1] || "미분류";
    const fullAddress = `경기도 성남시 ${address}`;
    return {
      id: idFromHomepage(homepage),
      name,
      rawName,
      sortName: name,
      status: statusMatch?.[1] || "운영",
      district,
      address,
      fullAddress,
      phone,
      fax,
      homepage,
      ...mapUrls(name, fullAddress),
      transitOrigin,
      transitMinutes: null,
      transitStatus: "확인필요",
      sourceUrl,
      sourceCheckedAt: checkedAt
    };
  })
  .sort((a, b) => a.sortName.localeCompare(b.sortName, "ko-KR"));

const meta = {
  generatedAt: checkedAt,
  schoolSource: sourceUrl,
  recruitmentSource: "https://www.goesn.kr/goesn/na/ntt/selectNttList.do?bbsId=17872&mi=23603",
  schoolCount: schools.length,
  recruitmentCount: 0,
  notes: [
    "School list was seeded from the official Seongnam Office of Education elementary-school status page verified in the browser.",
    "Recruitment data collection requires network access. Use npm run fetch:data when network approval is available.",
    "Counts and vendor names must be verified against each source notice before business decisions."
  ]
};

await mkdir(dataDir, { recursive: true });
await writeFile(join(dataDir, "schools.json"), `${JSON.stringify(schools, null, 2)}\n`, "utf-8");
await writeFile(join(dataDir, "schools.csv"), makeSchoolsCsv(schools), "utf-8");
await writeFile(join(dataDir, "recruitments.json"), "[]\n", "utf-8");
await writeFile(join(dataDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");
await writeFile(
  join(dataDir, "embedded-data.js"),
  `window.SEONGNAM_LIFEMAP_DATA = ${JSON.stringify({ schools, recruitments: [], meta }, null, 2)};\n`,
  "utf-8"
);
console.log(`Seeded ${schools.length} official schools.`);

function makeSchoolsCsv(items) {
  const rows = [
    ["학교명", "상태", "구", "주소", "전화번호", "팩스", "홈페이지", "대중교통분", "대중교통상태", "네이버지도", "카카오맵", "공식출처"],
    ...items.map((school) => [
      school.name,
      school.status,
      school.district,
      school.fullAddress,
      school.phone,
      school.fax,
      school.homepage,
      school.transitMinutes ?? "",
      school.transitStatus ?? "확인필요",
      school.naverMapUrl,
      school.kakaoMapUrl,
      school.sourceUrl
    ])
  ];
  return toExcelCsv(rows);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toExcelCsv(rows) {
  return `\ufeff${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
