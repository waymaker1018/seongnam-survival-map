// schools.json → schools.csv (엑셀용, BOM 포함)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dataDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const schools = JSON.parse(await readFile(join(dataDir, "schools.json"), "utf-8"));
const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [
  ["학교명", "구", "동", "주소", "전화", "팩스", "홈페이지"],
  ...schools.map((s) => [s.name, s.district, s.dong, s.fullAddress, s.phone, s.fax, s.homepage])
];
await writeFile(join(dataDir, "schools.csv"), "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n"), "utf-8");
console.log(`schools.csv 재생성 완료 (${schools.length}개교)`);
