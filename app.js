/* 채용 생존맵 — 구 → 동 → 학교 드릴다운 지도 (지역 설정 기반) */

// 페이지별 지역 설정 — index.html에서 window.REGION_CONFIG로 덮어쓸 수 있음
const REGION = Object.assign({
  name: "성남시",
  dataPrefix: "./data/",
  schoolsFile: "schools.json",
  recruitmentsFile: "recruitments.json",
  hitsFile: "school_notice_hits.json",
  trainingFile: "training_hits.json",
  boundariesFile: "boundaries_seongnam.json",
  fallbackCenter: [37.42, 127.125],
  initialZoom: 12
}, window.REGION_CONFIG || {});

const state = {
  schools: [],
  recruitments: [],
  hits: [],            // 최근 발견 공고
  training: [],        // 양성교육·전국 디지털튜터
  districts: [],       // 데이터에서 파생
  level: "city",       // city | district | dong
  district: null,
  dong: null,
  selectedSchoolId: null
};

let map;
let markerLayer;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
}

/* ── 데이터 로드 ─────────────────────────── */
async function loadJson(path, fallback) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(String(response.status));
    return await response.json();
  } catch {
    return fallback;
  }
}

async function loadData() {
  const prefix = REGION.dataPrefix;
  const [schools, recruitments, hits, training, boundaries] = await Promise.all([
    loadJson(prefix + REGION.schoolsFile, []),
    loadJson(prefix + REGION.recruitmentsFile, []),
    loadJson(prefix + REGION.hitsFile, { items: [] }),
    loadJson(prefix + REGION.trainingFile, { items: [] }),
    loadJson(prefix + REGION.boundariesFile, null)
  ]);
  state.boundaries = boundaries;
  state.schools = schools.filter((s) => s.lat && s.lng);
  state.recruitments = recruitments;
  state.hits = hits.items || [];
  state.training = training.items || [];
  // 구 목록은 데이터에서 파생 — 학교 수 많은 순 (구 미상 제외)
  const counts = {};
  for (const s of state.schools) if (s.district) counts[s.district] = (counts[s.district] || 0) + 1;
  state.districts = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b, "ko-KR"));

  initMap();
  bindSearch();
  render();
}

/* ── 파생 데이터 ─────────────────────────── */
// 동(洞)이 비어 있어도 학교가 드릴다운에서 사라지지 않도록 가상 그룹으로 묶음
const NO_DONG = "(동 미상)";
const dongOf = (school) => school.dong || NO_DONG;

function schoolsIn(district, dong) {
  return state.schools.filter((s) =>
    (!district || s.district === district) && (!dong || dongOf(s) === dong)
  );
}

function centroid(schools) {
  const lat = schools.reduce((sum, s) => sum + s.lat, 0) / schools.length;
  const lng = schools.reduce((sum, s) => sum + s.lng, 0) / schools.length;
  return [lat, lng];
}

function dongsOf(district) {
  const names = [...new Set(schoolsIn(district).map(dongOf))];
  // "(동 미상)"은 항상 맨 뒤로
  return names.sort((a, b) =>
    a === NO_DONG ? 1 : b === NO_DONG ? -1 : a.localeCompare(b, "ko-KR")
  );
}

function recentHitsFor(schoolId) {
  return state.hits.filter((h) => h.schoolId === schoolId);
}

function hitCountIn(district, dong) {
  const ids = new Set(schoolsIn(district, dong).map((s) => s.id));
  return state.hits.filter((h) => h.schoolId && ids.has(h.schoolId)).length;
}

function historyFor(schoolId) {
  return state.recruitments
    .filter((r) => r.schoolId === schoolId)
    .sort((a, b) => String(b.postedDate || "").localeCompare(String(a.postedDate || "")));
}

/* ── 지도 ───────────────────────────────── */
function cityCenter() {
  return state.schools.length ? centroid(state.schools) : REGION.fallbackCenter;
}

// GeoJSON 속성 이름 → 구 이름 ("성남시분당구" → "분당구")
function featureDistrict(feature) {
  return String(feature?.properties?.name || "").replace(/^.*?시(?=.+구$)/, "");
}

let boundaryLayer = null;

function renderBoundaries() {
  if (!state.boundaries || !map) return;
  if (boundaryLayer) boundaryLayer.remove();
  boundaryLayer = L.geoJSON(state.boundaries, {
    style: (feature) => {
      const selected = featureDistrict(feature) === state.district;
      return {
        color: "#2563eb",
        weight: selected ? 2.5 : 1.2,
        opacity: selected ? 0.9 : 0.55,
        fillColor: "#2563eb",
        fillOpacity: selected ? 0.08 : 0.03
      };
    },
    onEachFeature: (feature, layer) => {
      const district = featureDistrict(feature);
      if (!state.districts.includes(district)) return;
      layer.on("click", () => {
        state.level = "district";
        state.district = district;
        state.dong = null;
        render();
      });
      layer.bindTooltip(district, { sticky: true, direction: "top" });
    }
  }).addTo(map);
}

function initMap() {
  map = L.map("map", { zoomControl: true }).setView(cityCenter(), REGION.initialZoom);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
}

function chipMarker(latlng, html, className, onClick) {
  const icon = L.divIcon({ className: "", html: `<div class="chip-marker ${className}">${html}</div>`, iconSize: null });
  const marker = L.marker(latlng, { icon }).addTo(markerLayer);
  marker.on("click", onClick);
  return marker;
}

function renderMap() {
  markerLayer.clearLayers();
  renderBoundaries();

  if (state.level === "city") {
    for (const district of state.districts) {
      const schools = schoolsIn(district);
      if (!schools.length) continue;
      const hot = hitCountIn(district);
      chipMarker(
        centroid(schools),
        `${escapeHtml(district)} <span class="count">${schools.length}개교</span>${hot ? ` <span class="dot" style="display:inline-block"></span>` : ""}`,
        hot ? "hot" : "",
        () => { state.level = "district"; state.district = district; state.dong = null; render(); }
      );
    }
    map.flyTo(cityCenter(), REGION.initialZoom, { duration: 0.6 });
  }

  if (state.level === "district") {
    const dongs = dongsOf(state.district);
    for (const dong of dongs) {
      const schools = schoolsIn(state.district, dong);
      const hot = hitCountIn(state.district, dong);
      chipMarker(
        centroid(schools),
        `${escapeHtml(dong)} <span class="count">${schools.length}</span>`,
        hot ? "hot" : "",
        () => { state.level = "dong"; state.dong = dong; render(); }
      );
    }
    const all = schoolsIn(state.district);
    if (all.length) map.flyToBounds(L.latLngBounds(all.map((s) => [s.lat, s.lng])).pad(0.25), { duration: 0.6 });
  }

  if (state.level === "dong") {
    const schools = schoolsIn(state.district, state.dong);
    for (const school of schools) {
      const hasNotice = recentHitsFor(school.id).length > 0;
      chipMarker(
        [school.lat, school.lng],
        `<span class="dot"></span>${escapeHtml(school.name.replace(/초등학교$/, "초"))}`,
        `school${hasNotice ? " has-notice" : ""}${school.id === state.selectedSchoolId ? " selected" : ""}`,
        () => { state.selectedSchoolId = school.id; render(); }
      );
    }
    if (schools.length) map.flyToBounds(L.latLngBounds(schools.map((s) => [s.lat, s.lng])).pad(0.4), { duration: 0.6, maxZoom: 16 });
  }
}

/* ── 빵부스러기 ─────────────────────────── */
function renderBreadcrumb() {
  const parts = [];
  parts.push(`<button data-nav="city" aria-current="${state.level === "city"}">${escapeHtml(REGION.name)} 전체</button>`);
  if (state.district) {
    parts.push(`<span class="sep">›</span>`);
    parts.push(`<button data-nav="district" aria-current="${state.level === "district"}">${escapeHtml(state.district)}</button>`);
  }
  if (state.dong) {
    parts.push(`<span class="sep">›</span>`);
    parts.push(`<button data-nav="dong" aria-current="${state.level === "dong"}">${escapeHtml(state.dong)}</button>`);
  }
  $("breadcrumb").innerHTML = parts.join("");

  $("breadcrumb").querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      const nav = button.dataset.nav;
      if (nav === "city") { state.level = "city"; state.district = null; state.dong = null; }
      if (nav === "district") { state.level = "district"; state.dong = null; }
      render();
    });
  });
}

/* ── 요약 통계 ───────────────────────────── */
function renderStats() {
  const totalHits = state.hits.length;
  const officeHits = state.hits.filter((h) => !h.schoolId).length;
  const thisYear = new Date().getFullYear();
  const yearCount = state.recruitments.filter((r) => r.recruitmentYear === thisYear).length;
  // 구가 3개 이하(성남)면 구별 학교 수, 많으면(서울) 구 개수 표시
  const districtCard = state.districts.length <= 3
    ? `<div class="stat-card"><div class="num">${state.districts.map((d) => schoolsIn(d).length).join(" · ")}</div><div class="label">${state.districts.map((d) => escapeHtml(d.replace(/구$/, ""))).join(" · ")}</div></div>`
    : `<div class="stat-card"><div class="num">${state.districts.length}</div><div class="label">자치구</div></div>`;
  $("statsRow").innerHTML = `
    <div class="stat-card"><div class="num">${state.schools.length}</div><div class="label">${escapeHtml(REGION.name)} 초등학교</div></div>
    <div class="stat-card"><div class="num hot">${totalHits}</div><div class="label">최근 발견 공고 (학교 ${totalHits - officeHits} · 교육청 ${officeHits})</div></div>
    <div class="stat-card"><div class="num">${yearCount}</div><div class="label">${thisYear}년 모집 이력</div></div>
    ${districtCard}
  `;
}

/* ── 학교 상세 ───────────────────────────── */
// NEIS 일부 학교는 홈페이지 주소에 http://가 빠져 있음 — 상대경로로 깨지는 것 방지
function absoluteUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function renderDetail() {
  const school = state.schools.find((s) => s.id === state.selectedSchoolId);
  if (!school) return;

  const hits = recentHitsFor(school.id);
  const history = historyFor(school.id);
  const years = [...new Set(history.map((r) => r.recruitmentYear).filter(Boolean))].sort((a, b) => b - a);

  $("detailContent").innerHTML = `
    <h2>${escapeHtml(school.name)}${hits.length ? `<span class="badge">새 공고 ${hits.length}</span>` : ""}</h2>
    <p class="where-line">${escapeHtml(school.district)} ${escapeHtml(school.dong || "")}${school.geoApprox || school.dongApprox ? ` <span class="approx-note">(위치·동 정보 근사)</span>` : ""}</p>
    <table class="info-table">
      <tr><th>주소</th><td>${escapeHtml(school.fullAddress)}</td></tr>
      <tr><th>전화</th><td><a href="tel:${escapeHtml(school.phone)}">${escapeHtml(school.phone)}</a></td></tr>
      <tr><th>팩스</th><td>${escapeHtml(school.fax || "-")}</td></tr>
      <tr><th>홈페이지</th><td><a href="${escapeHtml(absoluteUrl(school.homepage))}" target="_blank" rel="noopener">${escapeHtml(school.homepage)}</a></td></tr>
    </table>
    <div class="link-row">
      <a href="${escapeHtml(absoluteUrl(school.homepage))}" target="_blank" rel="noopener">학교 홈페이지</a>
      <a href="${escapeHtml(school.naverMapUrl)}" target="_blank" rel="noopener">네이버지도</a>
      <a href="${escapeHtml(school.kakaoMapUrl)}" target="_blank" rel="noopener">카카오맵</a>
    </div>

    <div class="detail-section">
      <h3>최근 발견 공고 ${hits.length ? `<span class="badge">${hits.length}건</span>` : ""}</h3>
      ${hits.length
        ? hits.map((h) => `
            <div class="notice-item">
              <a href="${escapeHtml(h.url)}" target="_blank" rel="noopener">${escapeHtml(h.title)}</a>
              <span class="meta">${escapeHtml((h.postedAt || "").slice(0, 10))} · ${escapeHtml(h.boardLabel)}</span>
            </div>`).join("")
        : `<p class="approx-note">최근 키워드 매칭 공고가 없습니다.</p>`}
    </div>

    <div class="detail-section">
      <h3>모집 이력 <span class="badge soft">${history.length}건${years.length ? ` · ${years.join("/")}` : ""}</span></h3>
      ${history.slice(0, 8).map((r) => `
        <div class="history-item">
          <a href="${escapeHtml(r.sourceUrl)}" target="_blank" rel="noopener">${escapeHtml(r.title)}</a>
          <span class="meta">${escapeHtml(r.postedDate || "")} · ${escapeHtml(r.providerType || "")}${r.deadlineDate ? ` · 마감 ${escapeHtml(r.deadlineDate)}` : ""}</span>
        </div>`).join("") || `<p class="approx-note">수집된 모집 이력이 없습니다.</p>`}
    </div>
  `;
}

/* ── 최근 공고 목록 (하단) ────────────────── */
function renderNotices() {
  const items = [...state.hits].sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
  $("noticeMeta").textContent = items.length
    ? `${items.length}건 — 늘봄·방과후·디지털튜터·코딩 키워드 매칭`
    : "";
  $("noticeList").innerHTML = items.length
    ? items.slice(0, 30).map((h) => `
        <div class="notice-item">
          <strong>${escapeHtml(h.schoolName)}</strong>
          <a href="${escapeHtml(h.url)}" target="_blank" rel="noopener">${escapeHtml(h.title)}</a>
          <span class="meta">${escapeHtml((h.postedAt || "").slice(0, 10))} · ${escapeHtml(h.boardLabel)}</span>
        </div>`).join("")
    : `<div class="empty-state">아직 수집된 공고가 없습니다. <code>npm run daily</code>를 실행하면 최신 공고를 수집합니다.</div>`;
}

/* ── 양성교육·전국 디지털튜터 목록 ──────────── */
function renderTraining() {
  const items = [...state.training].sort((a, b) => String(b.postedAt || "").localeCompare(String(a.postedAt || "")));
  $("trainingMeta").textContent = items.length
    ? `${items.length}건 — 국가 무료 양성교육 + 경기·서울 디지털튜터 채용`
    : "";
  $("trainingList").innerHTML = items.length
    ? items.slice(0, 20).map((t) => `
        <div class="notice-item">
          <strong>${escapeHtml(t.source)}</strong>
          <a href="${escapeHtml(t.url)}" target="_blank" rel="noopener">${escapeHtml(t.title)}</a>
          <span class="meta">${escapeHtml((t.postedAt || "").slice(0, 10))}${t.deadline ? ` · 접수마감 ${escapeHtml(t.deadline.slice(0, 10))}` : ""}</span>
        </div>`).join("")
    : `<div class="empty-state">아직 수집된 양성교육 공고가 없습니다.</div>`;
}

/* ── 검색 ───────────────────────────────── */
function bindSearch() {
  const input = $("searchInput");
  const resultsBox = $("searchResults");

  input.addEventListener("input", () => {
    const query = input.value.trim();
    if (!query) { resultsBox.hidden = true; return; }
    const matches = state.schools
      .filter((s) => s.name.includes(query) || (s.dong || "").includes(query))
      .slice(0, 8);
    resultsBox.innerHTML = matches.length
      ? matches.map((s) => `
          <button data-school-id="${escapeHtml(s.id)}">
            ${escapeHtml(s.name)}<span class="where">${escapeHtml(s.district)} ${escapeHtml(s.dong || "")}</span>
          </button>`).join("")
      : `<button disabled>검색 결과 없음</button>`;
    resultsBox.hidden = false;

    resultsBox.querySelectorAll("button[data-school-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const school = state.schools.find((s) => s.id === button.dataset.schoolId);
        if (!school) return;
        state.level = "dong";
        state.district = school.district;
        state.dong = dongOf(school);
        state.selectedSchoolId = school.id;
        resultsBox.hidden = true;
        input.value = "";
        render();
      });
    });
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-box")) resultsBox.hidden = true;
  });
}

/* ── 렌더 루트 ───────────────────────────── */
function render() {
  renderBreadcrumb();
  renderStats();
  renderMap();
  renderDetail();
  renderNotices();
  renderTraining();

  const hints = {
    city: "구 마커를 클릭하면 동별로 들어갑니다.",
    district: `${state.district}의 동 마커를 클릭하면 학교가 표시됩니다.`,
    dong: "학교 마커를 클릭하면 오른쪽에 상세 정보가 표시됩니다."
  };
  $("mapHint").textContent = hints[state.level];
}

loadData();
