(function () {
  'use strict';
  var E = Engine, esc = E.esc;
  var CATS = { sight: '관광', food: '먹거리', activity: '체험', show: '공연', parking: '주차', stay: '숙소', etc: '기타' };
  var ST = { todo: '예정', arrived: '도착', done: '완료', skipped: '건너뜀' };
  var TABS = [['now', '장소별 진행'], ['plan', '전체 일정'], ['map', '지도'], ['places', '장소'], ['settings', '설정']];

  var S = Storage.load() || {};
  S.customTrips = S.customTrips || {};
  S.ts = S.ts || {};
  S.tab = S.tab || 'now';
  var $view = document.getElementById('view');
  var map = null, objectUrls = [], focusId = null;

  /* ---------- 상태 접근 ---------- */
  function allTrips() { return TripRegistry.list().concat(Object.keys(S.customTrips).map(function (k) { return S.customTrips[k]; })); }
  function trip() {
    var t = allTrips().filter(function (x) { return x.id === S.activeTrip; })[0] || allTrips()[0];
    S.activeTrip = t.id; return t;
  }
  function ts() {
    var t = trip(), s = S.ts[t.id];
    if (!s) s = S.ts[t.id] = { plan: t.defaultPlan || Object.keys(t.plans)[0], day: 1, ov: {}, progress: {}, userPlaces: [], placeMeta: {}, startDate: '' };
    if (!t.plans[s.plan]) s.plan = Object.keys(t.plans)[0];
    if (!t.days.some(function (d) { return d.n === s.day; })) s.day = t.days[0].n;
    return s;
  }
  function places() { var t = trip(); return t.places.concat(ts().userPlaces); }
  function placesById() { var m = {}; places().forEach(function (p) { m[p.id] = p; }); return m; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function dayItems(planId, day) {
    var s = ts(), key = planId + ':' + day;
    if (s.ov[key]) return s.ov[key];
    var def = (trip().plans[planId].days[day]) || [];
    return clone(def);
  }
  function setDayItems(day, items) { var s = ts(); s.ov[s.plan + ':' + day] = items; }
  function planDays(planId) {
    var out = {}; trip().days.forEach(function (d) { out[d.n] = dayItems(planId, d.n); }); return out;
  }
  function ensureMandatory(planId) {
    var t = trip(), s = ts(), mand = (t.mandatory || []).filter(function (id) { return placesById()[id]; });
    if (!mand.length) return;
    var days = planDays(planId), fixed = E.repairMandatory(mand, days, t.plans[planId].days);
    if (fixed.length) { Object.keys(days).forEach(function (d) { s.ov[planId + ':' + d] = days[d]; }); toast('필수 방문지를 복구했어요: ' + fixed.map(function (i) { return placesById()[i].name; }).join(', ')); }
  }

  /* ---------- 공통 ---------- */
  function persist() { var r = Storage.save(S); if (!r.ok) toast(r.error, true); return r.ok; }
  function toast(msg, isErr) {
    var box = document.getElementById('notice'), d = document.createElement('div');
    d.textContent = msg; if (isErr) d.className = 'err'; box.appendChild(d);
    setTimeout(function () { d.remove(); }, isErr ? 6000 : 3200);
  }
  function mapsLink(p, mode) { return E.directionsUrl(p, mode); }
  function dayMeta(n) { return trip().days.filter(function (d) { return d.n === n; })[0]; }
  function dayLabel(n) {
    var s = ts(), m = dayMeta(n), lbl = m.label || (n + '일차');
    if (s.startDate) { var d = new Date(s.startDate + 'T00:00:00'); if (!isNaN(d)) { d.setDate(d.getDate() + n - 1); lbl += ' (' + (d.getMonth() + 1) + '/' + d.getDate() + ')'; } }
    return lbl;
  }
  function timelineFor(day) {
    return E.timeline(dayItems(ts().plan, day), placesById(), dayMeta(day).start);
  }
  function itemTitle(row) { return row.place ? row.place.name : (row.item.rest || '일정'); }
  function prog(id) { var s = ts(); return s.progress[id] || (s.progress[id] = {}); }

  /* ---------- 렌더 ---------- */
  function render() {
    var t = trip(), s = ts(), sel = document.getElementById('tripSel');
    sel.innerHTML = allTrips().map(function (x) { return '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('');
    document.getElementById('tripTitle').textContent = t.title;
    document.getElementById('tripSub').textContent = [t.dest, t.party, s.startDate ? s.startDate + ' 출발' : ''].filter(Boolean).join(' · ');
    document.getElementById('tabs').innerHTML = TABS.map(function (x) {
      return '<button role="tab" data-act="tab" data-id="' + x[0] + '" aria-selected="' + (S.tab === x[0]) + '">' + x[1] + '</button>';
    }).join('');
    destroyMap();
    ensureMandatory(s.plan);
    var fn = { now: vNow, plan: vPlan, map: vMap, places: vPlaces, settings: vSettings }[S.tab] || vNow;
    $view.innerHTML = fn();
    afterRender();
    persist();
  }

  function planBar() {
    var t = trip(), s = ts();
    var plans = Object.keys(t.plans).map(function (k) { return '<button class="chip" data-act="plan" data-id="' + esc(k) + '" aria-pressed="' + (s.plan === k) + '">' + esc(t.plans[k].label) + '</button>'; }).join('');
    var days = t.days.map(function (d) { return '<button class="chip" data-act="day" data-id="' + d.n + '" aria-pressed="' + (s.day === d.n) + '">' + esc(dayLabel(d.n)) + '</button>'; }).join('');
    var st = E.mandatoryStatus((t.mandatory || []).filter(function (id) { return placesById()[id]; }), planDays(s.plan));
    var warn = st.excluded.length ? '<div class="warnbox" role="alert">⚠️ 필수 방문지가 일정에서 제외됨: ' + st.excluded.map(function (i) { return esc(placesById()[i].name); }).join(', ') + '</div>' : '';
    return '<div class="chips" role="group" aria-label="여행 대안">' + plans + '</div><p class="mut" style="margin:0">' + esc(t.plans[s.plan].desc || '') + '</p>' +
      '<div class="chips" role="group" aria-label="날짜">' + days + '</div>' + warn;
  }

  function statusBadge(id) {
    var st = (ts().progress[id] || {}).status || 'todo';
    return st === 'todo' ? '' : '<span class="badge st-' + st + '">' + ST[st] + '</span>';
  }
  function mustBadge(p) { return p && (trip().mandatory || []).indexOf(p.id) >= 0 ? '<span class="badge must">필수</span>' : ''; }

  /* --- 전체 일정 --- */
  function vPlan() {
    var s = ts(), items = dayItems(s.plan, s.day), rows = timelineFor(s.day), html = planBar(), errs = E.validateItems(items, placesById());
    if (errs.length) html += '<div class="warnbox" role="alert">' + errs.map(esc).join('<br>') + '</div>';
    var inc = rows.filter(function (r) { return r.included; });
    if (inc.length) html += '<p class="mut">' + E.fmt(inc[0].start) + ' 시작 → ' + E.fmt(inc[inc.length - 1].end) + ' 종료 예상 (계획용 추정)</p>';
    rows.forEach(function (r, i) {
      var it = r.item, p = r.place;
      if (r.travel) html += '<div class="travel">' + (r.travel.mode === 'car' ? '🚗 차량' : '🚶 도보') + ' 약 ' + r.travel.min + '분 · ' + r.travel.km.toFixed(1) + 'km (추정)</div>';
      html += '<div class="card tl-item' + (r.included ? '' : ' off') + '"><div class="tl-time">' + (r.included ? E.fmt(r.start) : '—') + '</div><div>' +
        '<h3>' + esc(itemTitle(r)) + mustBadge(p) + (p && p.approx ? '<span class="badge">좌표 근사</span>' : '') + statusBadge(it.id) + '</h3>' +
        '<div class="mut">' + (p ? esc(CATS[p.cat] || '') + ' · ' : '') + r.dur + '분' + (r.included ? ' → ' + E.fmt(r.end) : ' · 제외됨') + '</div>' +
        '<div class="tools">' +
        '<button data-act="toggle" data-id="' + esc(it.id) + '" aria-label="' + (r.included ? '제외' : '포함') + '">' + (r.included ? '제외' : '포함') + '</button>' +
        '<button data-act="up" data-i="' + i + '" aria-label="위로" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
        '<button data-act="down" data-i="' + i + '" aria-label="아래로" ' + (i === rows.length - 1 ? 'disabled' : '') + '>↓</button>' +
        '<button data-act="dur" data-id="' + esc(it.id) + '" data-d="-10" aria-label="체류시간 10분 감소">−10분</button>' +
        '<button data-act="dur" data-id="' + esc(it.id) + '" data-d="10" aria-label="체류시간 10분 증가">+10분</button>' +
        (p ? '<button data-act="focus" data-id="' + esc(it.id) + '">진행 ▶</button>' : '') +
        (!(trip().mandatory || []).includes(it.p) ? '<button class="danger" data-act="remove" data-id="' + esc(it.id) + '">삭제</button>' : '') +
        '</div></div></div>';
    });
    html += '<div class="card"><h3>일정에 추가</h3><div class="row"><select id="addSel" aria-label="추가할 장소">' +
      places().map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.name) + '</option>'; }).join('') +
      '</select><button class="pri" data-act="add-item">추가</button></div>' +
      '<div class="row" style="margin-top:8px"><input type="text" id="restTitle" placeholder="장소 없는 일정 (예: 휴식, 이동)" aria-label="일정 이름"><button data-act="add-rest">추가</button></div></div>';
    html += '<button class="ghost" data-act="reset-day">이 날짜를 기본 일정으로 되돌리기</button>';
    return html;
  }

  /* --- 장소별 진행 --- */
  function vNow() {
    var s = ts(), items = dayItems(s.plan, s.day), rows = timelineFor(s.day);
    var inc = rows.filter(function (r) { return r.included; });
    var st = E.dayStats(items, s.progress), pct = st.total ? Math.round((st.done + st.skipped) / st.total * 100) : 0;
    var html = planBar();
    html += '<div class="card"><div class="row sp"><strong>' + esc(dayLabel(s.day)) + ' 진행</strong><span class="mut">' + st.done + '완료 · ' + st.skipped + '건너뜀 / ' + st.total + '곳</span></div>' +
      '<div class="progress" role="progressbar" aria-valuenow="' + pct + '" aria-valuemin="0" aria-valuemax="100"><i style="width:' + pct + '%"></i></div></div>';
    if (!inc.length) return html + '<p class="card">이 날짜에는 포함된 일정이 없습니다. 「전체 일정」에서 추가하세요.</p>';
    var cur = focusId && inc.filter(function (r) { return r.item.id === focusId; })[0];
    if (!cur) { var ci = E.currentIndex(items, s.progress); cur = ci < 0 ? null : rows.filter(function (r) { return r.item.id === items[ci].id; })[0]; }
    html += '<div class="stepper" role="group" aria-label="장소 선택">' + inc.map(function (r, i) {
      var stt = (s.progress[r.item.id] || {}).status || 'todo', isCur = cur && cur.item.id === r.item.id;
      return '<button data-act="focus" data-id="' + esc(r.item.id) + '"' + (isCur ? ' aria-current="step"' : '') + ' class="' + (stt === 'done' || stt === 'skipped' ? 'done' : '') + '">' +
        (stt === 'done' ? '✓ ' : stt === 'skipped' ? '– ' : (i + 1) + '. ') + esc(itemTitle(r)) + '</button>';
    }).join('') + '</div>';
    if (!cur) return html + '<div class="card"><h3>🎉 오늘 일정 끝!</h3><p>모든 장소를 완료하거나 건너뛰었어요. 장소를 눌러 기록을 다시 볼 수 있습니다.</p></div>';
    return html + placeCard(cur, inc);
  }

  function placeCard(r, inc) {
    var it = r.item, p = r.place, pg = prog(it.id), idx = inc.indexOf(r), next = inc[idx + 1];
    var stt = pg.status || 'todo';
    var h = '<div class="card"><div class="row sp"><h3>' + (idx + 1) + '. ' + esc(itemTitle(r)) + mustBadge(p) + statusBadge(it.id) + '</h3><span class="tl-time">' + E.fmt(r.start) + '–' + E.fmt(r.end) + '</span></div>';
    if (r.travel) h += '<div class="mut">이전 장소에서 ' + (r.travel.mode === 'car' ? '🚗' : '🚶') + ' 약 ' + r.travel.min + '분 (추정)</div>';
    if (p) {
      if (p.desc) h += '<p>' + esc(p.desc) + '</p>';
      if (p.hours) h += '<div class="warnbox">🕒 ' + esc(p.hours) + ' — 참고 정보이며 실시간 확인 결과가 아닙니다.</div>';
      h += '<div class="row">';
      if (p.addr) h += '<span class="mut">📍 ' + esc(p.addr) + '</span>';
      h += '<a href="' + esc(mapsLink(p, 'walk')) + '" target="_blank" rel="noopener">🚶 도보 길찾기 ↗</a><a href="' + esc(mapsLink(p, 'car')) + '" target="_blank" rel="noopener">🚗 차량 길찾기 ↗</a></div>';
      if (p.approx) h += '<p class="mut">※ 지도 좌표는 근사치입니다. 길찾기 전 위치를 확인하세요.</p>';
    }
    h += '<div class="row" style="margin:10px 0" role="group" aria-label="진행 상태">' +
      ['arrived', 'done', 'skipped'].map(function (k) {
        return '<button class="' + (stt === k ? 'pri' : '') + '" data-act="status" data-id="' + esc(it.id) + '" data-v="' + k + '" aria-pressed="' + (stt === k) + '">' + { arrived: '📍 도착', done: '✅ 완료', skipped: '⏭ 건너뜀' }[k] + '</button>';
      }).join('') + (stt !== 'todo' ? '<button class="ghost" data-act="status" data-id="' + esc(it.id) + '" data-v="todo">되돌리기</button>' : '') + '</div>';
    if (p && p.checks && p.checks.length) {
      h += '<h4>방문 전 확인</h4>' + p.checks.map(function (c, i) {
        return '<label class="check"><input type="checkbox" data-act="check" data-id="' + esc(it.id) + '" data-i="' + i + '"' + ((pg.checks || {})[i] ? ' checked' : '') + '><span>' + esc(c) + '</span></label>';
      }).join('');
      h += '<p class="mut">체크는 사용자가 직접 확인했다는 표시이며 앱이 검증한 결과가 아닙니다.</p>';
    }
    if (p && p.tips && p.tips.length) h += '<h4>팁</h4><ul>' + p.tips.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
    if (p && p.food && p.food.length) h += '<h4>먹거리 후보</h4><div class="chips">' + p.food.map(function (x) { return '<span class="badge">' + esc(x) + '</span>'; }).join('') + '</div>';
    h += '<label for="memo-' + esc(it.id) + '">메모</label><textarea id="memo-' + esc(it.id) + '" data-act="memo" data-id="' + esc(it.id) + '" placeholder="예약번호, 주차 위치, 느낀 점…">' + esc(pg.memo || '') + '</textarea>';
    h += '<div class="grid2"><div><label for="cost-' + esc(it.id) + '">지출(원)</label><input type="number" min="0" step="100" inputmode="numeric" id="cost-' + esc(it.id) + '" data-act="cost" data-id="' + esc(it.id) + '" value="' + (pg.cost != null ? esc(pg.cost) : '') + '"></div>' +
      '<div><label>사진</label><button data-act="photo" data-key="' + esc(it.p || it.id) + '" style="width:100%">📷 추가</button></div></div>';
    h += '<div class="photos" data-photos="' + esc(photoKey(it.p || it.id)) + '"></div>';
    if (p) h += photoUrlsHtml(p.id);
    h += '<div class="row sp" style="margin-top:12px">' + (next ? '<button class="pri big-btn" data-act="next" data-id="' + esc(it.id) + '">완료하고 다음: ' + esc(itemTitle(next)) + ' ▶</button>' : '<button class="pri big-btn" data-act="status" data-id="' + esc(it.id) + '" data-v="done">마지막 장소 완료 🎉</button>') + '</div></div>';
    return h;
  }
  function photoKey(pid) { return trip().id + ':' + pid; }
  function photoUrlsHtml(pid) {
    var urls = (ts().placeMeta[pid] || {}).urls || [];
    return '<div class="photos">' + urls.map(function (u, i) {
      return '<figure><img src="' + esc(u) + '" alt="장소 사진" loading="lazy" referrerpolicy="no-referrer"><button data-act="rm-url" data-id="' + esc(pid) + '" data-i="' + i + '" aria-label="사진 삭제">✕</button></figure>';
    }).join('') + '</div>';
  }

  /* --- 지도 --- */
  function vMap() {
    return planBar() + '<div id="map" role="region" aria-label="일정 지도"></div><p class="mut" id="mapMsg">지도 타일은 인터넷 연결이 필요합니다. 지도가 보이지 않아도 「전체 일정」에서 텍스트 일정을 확인할 수 있어요. 지도 © OpenStreetMap contributors.</p>';
  }
  function destroyMap() { if (map) { map.remove(); map = null; } }
  function initMap() {
    var el = document.getElementById('map'); if (!el) return;
    if (!window.L) { el.innerHTML = '<p style="padding:16px">지도 라이브러리를 불러오지 못했습니다. 일정 텍스트와 길찾기 링크를 이용하세요.</p>'; return; }
    var rows = timelineFor(ts().day).filter(function (r) { return r.included && E.hasCoord(r.place); });
    map = L.map(el).setView(trip().center || [36.5, 127.8], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
    var pts = rows.map(function (r, i) {
      var ll = [r.place.lat, r.place.lon], stt = (ts().progress[r.item.id] || {}).status;
      var icon = L.divIcon({ className: '', html: '<div style="background:' + (stt === 'done' ? '#15803d' : '#2f6f5e') + ';color:#fff;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;border:2px solid #fff">' + (i + 1) + '</div>', iconSize: [26, 26], iconAnchor: [13, 13] });
      var pop = document.createElement('div'); pop.innerHTML = '<strong></strong><br><a target="_blank" rel="noopener">길찾기 ↗</a>';
      pop.querySelector('strong').textContent = (i + 1) + '. ' + r.place.name; pop.querySelector('a').href = mapsLink(r.place, 'walk');
      L.marker(ll, { icon: icon }).addTo(map).bindPopup(pop); return ll;
    });
    if (pts.length > 1) { L.polyline(pts, { color: '#2f6f5e', weight: 3, dashArray: '6 6' }).addTo(map); map.fitBounds(pts, { padding: [30, 30] }); }
    else if (pts.length === 1) map.setView(pts[0], 15);
    setTimeout(function () { map && map.invalidateSize(); }, 200);
  }

  /* --- 장소 카탈로그 --- */
  function vPlaces() {
    var q = (ts().q || '').toLowerCase();
    var list = places().filter(function (p) { return !q || (p.name + ' ' + (p.desc || '') + ' ' + (CATS[p.cat] || '')).toLowerCase().indexOf(q) >= 0; });
    var html = '<div class="row"><input type="text" id="q" value="' + esc(ts().q || '') + '" placeholder="장소 검색" aria-label="장소 검색"><button class="pri" data-act="place-form">＋ 장소 만들기</button></div>';
    var used = {}; planDays(ts().plan); Object.keys(planDays(ts().plan)).forEach(function (d) { planDays(ts().plan)[d].forEach(function (i) { if (i.p) used[i.p] = 1; }); });
    html += list.map(function (p) {
      var user = ts().userPlaces.some(function (u) { return u.id === p.id; });
      return '<div class="card"><h3>' + esc(p.name) + mustBadge(p) + '<span class="badge">' + esc(CATS[p.cat] || '기타') + '</span>' + (user ? '<span class="badge">내 장소</span>' : '') + (used[p.id] ? '<span class="badge st-done">일정 포함</span>' : '') + '</h3>' +
        '<div class="mut">' + p.dur + '분' + (p.hours ? ' · ' + esc(p.hours) : '') + '</div>' + (p.desc ? '<p>' + esc(p.desc) + '</p>' : '') + (p.note ? '<p class="mut">메모: ' + esc(p.note) + '</p>' : '') +
        '<div class="tools"><button class="pri" data-act="add-place-item" data-id="' + esc(p.id) + '">현재 일정에 추가</button>' +
        (E.hasCoord(p) ? '<a href="' + esc(mapsLink(p, 'walk')) + '" target="_blank" rel="noopener"><button>길찾기 ↗</button></a>' : '') +
        '<button data-act="add-url" data-id="' + esc(p.id) + '">사진 URL</button><button data-act="photo" data-key="' + esc(p.id) + '">📷 사진</button>' +
        (user ? '<button data-act="place-form" data-id="' + esc(p.id) + '">수정</button><button class="danger" data-act="del-place" data-id="' + esc(p.id) + '">삭제</button>' : '') + '</div>' +
        '<div class="photos" data-photos="' + esc(photoKey(p.id)) + '"></div>' + photoUrlsHtml(p.id) + '</div>';
    }).join('') || '<p class="mut">검색 결과가 없습니다.</p>';
    return html;
  }

  /* --- 설정 --- */
  function vSettings() {
    var s = ts(), t = trip(), total = 0;
    Object.keys(s.progress).forEach(function (k) { total += +s.progress[k].cost || 0; });
    var custom = !!S.customTrips[t.id];
    return '<div class="card"><h3>여행 정보</h3><label for="startDate">출발일</label><input type="date" id="startDate" value="' + esc(s.startDate) + '">' +
      '<label for="dayStart">' + esc(dayLabel(s.day)) + ' 시작 시각</label><input type="time" id="dayStart" value="' + esc(dayMeta(s.day).start) + '">' +
      '<p class="mut">누적 지출 기록: <strong>' + total.toLocaleString('ko-KR') + '원</strong></p></div>' +
      '<div class="card"><h3>일차 관리</h3><div class="row"><button data-act="add-day">＋ 일차 추가</button>' + (t.days.length > 1 && custom ? '<button class="danger" data-act="del-day">마지막 일차 삭제</button>' : '') + '</div>' +
      (custom ? '' : '<p class="mut">기본 제공 여행은 일차 삭제가 제한됩니다. 새 여행을 만들면 자유롭게 구성할 수 있어요.</p>') + '</div>' +
      '<div class="card"><h3>백업 / 복원</h3><p class="mut">일정·내 장소·진행 기록·사진 URL을 JSON으로 저장합니다. (기기 안에 저장된 사진 파일은 포함되지 않습니다.)</p>' +
      '<div class="row"><button class="pri" data-act="export">내보내기</button><button data-act="import">가져오기</button><input type="file" id="importFile" accept="application/json" hidden></div></div>' +
      '<div class="card"><h3>여행(여행지) 가져오기 / 내보내기</h3><p class="mut">다른 여행지는 여행 JSON 파일로 추가할 수 있어요 (형식: trips/template.json.example). 지금 여행을 내보내 템플릿으로 쓰거나 가족과 공유할 수도 있습니다.</p>' +
      '<div class="row"><button class="pri" data-act="import-trip">여행 파일 가져오기</button><button data-act="export-trip">현재 여행 내보내기</button><input type="file" id="tripFile" accept="application/json,.json" hidden></div></div>' +
      '<div class="card"><h3>데이터 초기화</h3><div class="row"><button class="danger" data-act="reset-trip">이 여행 진행 기록 초기화</button></div></div>' +
      '<div class="card"><h3>여행지 추가하기</h3><p class="mut">개발자는 <code>js/trips/</code>에 여행 데이터 파일을 추가해 새 여행지를 등록할 수 있습니다. 자세한 방법은 docs/EXTENDING.md 참고.</p></div>';
  }

  function afterRender() {
    if (S.tab === 'map') initMap();
    objectUrls.forEach(function (u) { URL.revokeObjectURL(u); }); objectUrls = [];
    document.querySelectorAll('[data-photos]').forEach(function (el) {
      Storage.photos.byPlace(el.getAttribute('data-photos')).then(function (recs) {
        recs.forEach(function (r) {
          var u = URL.createObjectURL(r.blob); objectUrls.push(u);
          var f = document.createElement('figure'), im = document.createElement('img'), b = document.createElement('button');
          im.src = u; im.alt = '추가한 사진'; b.textContent = '✕'; b.setAttribute('aria-label', '사진 삭제');
          b.onclick = function () { Storage.photos.remove(r.id).then(function () { f.remove(); }, function () { toast('사진 삭제 실패', true); }); };
          f.appendChild(im); f.appendChild(b); el.appendChild(f);
        });
      }, function () { if (!window.__photoErr) { window.__photoErr = 1; toast('사진 저장소를 사용할 수 없어요. 일정 기능은 계속 사용할 수 있습니다.', true); } });
    });
  }

  /* ---------- 다이얼로그 ---------- */
  function dialog(html, onSubmit) {
    var d = document.createElement('dialog'); d.innerHTML = '<form method="dialog">' + html + '<div class="row sp" style="margin-top:12px"><button value="cancel" formnovalidate>취소</button><button class="pri" value="ok">저장</button></div></form>';
    document.body.appendChild(d);
    d.addEventListener('close', function () { var ok = d.returnValue === 'ok'; if (ok && onSubmit(d) === false) { d.returnValue = ''; d.showModal(); return; } d.remove(); });
    d.showModal(); return d;
  }
  function v(d, n) { return d.querySelector('[name=' + n + ']').value.trim(); }

  function placeForm(id) {
    var ex = id && ts().userPlaces.filter(function (p) { return p.id === id; })[0] || {};
    var d = dialog('<h3>' + (id ? '장소 수정' : '내 장소 만들기') + '</h3>' +
      '<label>이름 *</label><input type="text" name="name" required value="' + esc(ex.name) + '">' +
      '<label>분류</label><select name="cat">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (ex.cat === k ? ' selected' : '') + '>' + CATS[k] + '</option>'; }).join('') + '</select>' +
      '<label>주소 / 검색어</label><input type="text" name="addr" value="' + esc(ex.addr) + '">' +
      '<div class="grid2"><div><label>위도</label><input type="text" name="lat" inputmode="decimal" value="' + esc(ex.lat) + '"></div><div><label>경도</label><input type="text" name="lon" inputmode="decimal" value="' + esc(ex.lon) + '"></div></div>' +
      '<div class="grid2"><div><label>예상 체류(분)</label><input type="number" name="dur" min="5" max="600" value="' + esc(ex.dur || 45) + '"></div><div><label>운영시간(참고)</label><input type="text" name="hours" value="' + esc(ex.hours) + '"></div></div>' +
      '<label>추가 이유</label><input type="text" name="desc" value="' + esc(ex.desc) + '"><label>메모</label><textarea name="note">' + esc(ex.note) + '</textarea>' +
      '<label class="check"><input type="checkbox" name="addNow"' + (id ? '' : ' checked') + '> 저장 후 현재 일정에 추가</label><p class="mut" id="formErr" role="alert"></p>', function (dd) {
      var name = v(dd, 'name'), lat = v(dd, 'lat'), lon = v(dd, 'lon'), err = '';
      if (!name) err = '이름은 필수입니다.';
      var la = lat === '' ? null : Number(lat), lo = lon === '' ? null : Number(lon);
      if (!err && ((lat === '') !== (lon === ''))) err = '위도와 경도를 함께 입력하거나 둘 다 비워 주세요.';
      if (!err && la != null && !E.validCoord(la, lo)) err = '좌표가 올바르지 않습니다 (위도 -90~90, 경도 -180~180).';
      var dur = Number(v(dd, 'dur')); if (!err && !(dur >= 5 && dur <= 600)) err = '체류시간은 5~600분 사이로 입력하세요.';
      if (err) { toast(err, true); return false; }
      var p = { id: id || E.uid('u'), name: name, cat: v(dd, 'cat'), addr: v(dd, 'addr'), lat: la, lon: lo, dur: dur, hours: v(dd, 'hours'), desc: v(dd, 'desc'), note: v(dd, 'note'), user: true };
      if (la == null) { delete p.lat; delete p.lon; }
      var arr = ts().userPlaces, i = arr.findIndex(function (x) { return x.id === p.id; });
      if (i >= 0) arr[i] = p; else arr.push(p);
      if (dd.querySelector('[name=addNow]').checked && !id) addItem({ id: E.uid('it'), p: p.id });
      render(); toast('장소를 저장했어요.');
    });
    return d;
  }

  function addItem(item) {
    var s = ts(); var items = dayItems(s.plan, s.day).slice(); items.push(item); setDayItems(s.day, items);
  }

  /* ---------- 이벤트 ---------- */
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' && el.type !== 'checkbox') return;
    var a = el.dataset.act, id = el.dataset.id, s = ts(), t = trip();
    if (a === 'check') return;
    if (a === 'tab') { S.tab = id; return render(); }
    if (a === 'plan') { s.plan = id; focusId = null; return render(); }
    if (a === 'day') { s.day = +id; focusId = null; return render(); }
    if (a === 'focus') { focusId = id; S.tab = 'now'; return render(); }
    var items = dayItems(s.plan, s.day).slice();
    function byId() { return items.filter(function (i) { return i.id === id; })[0]; }
    if (a === 'toggle') {
      var it = byId(), pl = it.p && placesById()[it.p];
      if (it.included !== false && (t.mandatory || []).indexOf(it.p) >= 0 && !confirm(pl.name + '은(는) 필수 방문지입니다. 정말 일정에서 제외할까요?')) return;
      it.included = it.included === false; setDayItems(s.day, items); return render();
    }
    if (a === 'up' || a === 'down') {
      var r = E.move(items, +el.dataset.i, a === 'up' ? -1 : 1, t.mandatory || []);
      if (!r.ok) return toast(r.reason, true); setDayItems(s.day, r.items); return render();
    }
    if (a === 'dur') { var it2 = byId(), row = timelineFor(s.day).filter(function (x) { return x.item.id === id; })[0]; it2.dur = Math.max(5, row.dur + +el.dataset.d); setDayItems(s.day, items); return render(); }
    if (a === 'remove') { if (!confirm('이 일정을 삭제할까요?')) return; setDayItems(s.day, items.filter(function (i) { return i.id !== id; })); return render(); }
    if (a === 'add-item') { addItem({ id: E.uid('it'), p: document.getElementById('addSel').value }); return render(); }
    if (a === 'add-rest') { var tt = document.getElementById('restTitle').value.trim(); if (!tt) return toast('일정 이름을 입력하세요.', true); addItem({ id: E.uid('it'), rest: tt, dur: 30 }); return render(); }
    if (a === 'add-place-item') { addItem({ id: E.uid('it'), p: id }); toast('현재 일정(' + dayLabel(s.day) + ')에 추가했어요.'); return render(); }
    if (a === 'reset-day') { if (!confirm('이 날짜의 수정 내용을 지우고 기본 일정으로 되돌릴까요? (진행 기록은 유지)')) return; delete s.ov[s.plan + ':' + s.day]; return render(); }
    if (a === 'status') { var pg = prog(id); pg.status = el.dataset.v; pg.at = Date.now(); if (pg.status === 'todo') delete pg.status; focusId = id; return render(); }
    if (a === 'next') {
      prog(id).status = 'done'; prog(id).at = Date.now();
      var cur = E.currentIndex(dayItems(s.plan, s.day), s.progress); focusId = cur >= 0 ? dayItems(s.plan, s.day)[cur].id : null; window.scrollTo(0, 0); return render();
    }
    if (a === 'place-form') return placeForm(id);
    if (a === 'del-place') {
      if (!confirm('이 장소를 삭제할까요? 일정에서도 제거됩니다.')) return;
      s.userPlaces = s.userPlaces.filter(function (p) { return p.id !== id; });
      Object.keys(s.ov).forEach(function (k) { s.ov[k] = s.ov[k].filter(function (i) { return i.p !== id; }); }); return render();
    }
    if (a === 'add-url') {
      return dialog('<h3>사진 URL 추가</h3><label>https:// 주소</label><input type="url" name="u" required placeholder="https://…">', function (d) {
        var u = v(d, 'u'); if (!/^https:\/\//i.test(u)) { toast('https:// 로 시작하는 주소만 사용할 수 있어요.', true); return false; }
        var m = s.placeMeta[id] || (s.placeMeta[id] = {}); (m.urls = m.urls || []).push(u); render();
      });
    }
    if (a === 'rm-url') { s.placeMeta[id].urls.splice(+el.dataset.i, 1); return render(); }
    if (a === 'photo') {
      var inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
      inp.onchange = function () {
        var key = photoKey(el.dataset.key);
        Array.prototype.reduce.call(inp.files, function (pr, f) {
          return pr.then(function () { return Storage.shrinkImage(f).then(function (b) { return Storage.photos.add({ id: E.uid('ph'), placeKey: key, blob: b, name: f.name, at: Date.now() }); }); });
        }, Promise.resolve()).then(function () { toast('사진을 저장했어요.'); render(); }, function (err) { toast(err.message || '사진 저장 실패', true); });
      };
      return inp.click();
    }
    if (a === 'new-trip') {
      return dialog('<h3>새 여행 만들기</h3><label>여행 이름 *</label><input type="text" name="title" required placeholder="예: 강릉 가을 여행">' +
        '<label>여행지</label><input type="text" name="dest"><label>동행</label><input type="text" name="party" placeholder="예: 성인 2 · 초등 1">' +
        '<label>일수</label><input type="number" name="days" min="1" max="14" value="2">', function (d) {
        var title = v(d, 'title'); if (!title) { toast('여행 이름은 필수입니다.', true); return false; }
        var n = Math.min(14, Math.max(1, +v(d, 'days') || 1)), days = [], pd = {};
        for (var i = 1; i <= n; i++) { days.push({ n: i, label: i + '일차', start: '10:00' }); pd[i] = []; }
        var id = E.uid('trip'); S.customTrips[id] = { id: id, title: title, dest: v(d, 'dest'), party: v(d, 'party'), days: days, mandatory: [], places: [], plans: { main: { label: '내 일정', desc: '직접 구성하는 일정', days: pd } }, defaultPlan: 'main' };
        S.activeTrip = id; S.tab = 'places'; render(); toast('새 여행을 만들었어요. 장소를 추가해 보세요.');
      });
    }
    if (a === 'add-day') {
      var n2 = t.days.length + 1; t.days.push({ n: n2, label: n2 + '일차', start: '10:00' });
      Object.keys(t.plans).forEach(function (k) { t.plans[k].days[n2] = t.plans[k].days[n2] || []; });
      if (!S.customTrips[t.id]) { S.extraDays = S.extraDays || {}; S.extraDays[t.id] = t.days.length; }
      return render();
    }
    if (a === 'del-day') {
      var last = t.days[t.days.length - 1].n; if (!confirm(last + '일차를 삭제할까요?')) return;
      t.days.pop(); Object.keys(t.plans).forEach(function (k) { delete t.plans[k].days[last]; delete s.ov[k + ':' + last]; }); if (s.day === last) s.day = 1; return render();
    }
    if (a === 'export') {
      var blob = new Blob([JSON.stringify({ app: 'trip-planner', v: 2, state: { customTrips: S.customTrips, ts: S.ts, activeTrip: S.activeTrip } }, null, 2)], { type: 'application/json' });
      var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'trip-backup-' + new Date().toISOString().slice(0, 10) + '.json'; link.click(); return;
    }
    if (a === 'import') { var f = document.getElementById('importFile'); f.onchange = function () {
      var rd = new FileReader(); rd.onload = function () {
        try { var j = JSON.parse(rd.result); if (j.app !== 'trip-planner' || !j.state) throw new Error(); if (!confirm('현재 데이터를 백업 파일 내용으로 덮어쓸까요?')) return;
          S.customTrips = j.state.customTrips || {}; S.ts = j.state.ts || {}; S.activeTrip = j.state.activeTrip; render(); toast('가져오기 완료'); } catch (x) { toast('올바른 백업 파일이 아닙니다.', true); } };
      rd.readAsText(f.files[0]); }; return f.click(); }
    if (a === 'export-trip') {
      var tj = clone(t); tj.places = tj.places.concat(s.userPlaces);
      Object.keys(s.ov).forEach(function (k) { var pr = k.split(':'); if (tj.plans[pr[0]]) tj.plans[pr[0]].days[pr[1]] = s.ov[k]; });
      var tb = new Blob([JSON.stringify(tj, null, 2)], { type: 'application/json' }), tl = document.createElement('a');
      tl.href = URL.createObjectURL(tb); tl.download = t.id + '.json'; tl.click(); return;
    }
    if (a === 'import-trip') {
      var tf = document.getElementById('tripFile'); tf.onchange = function () {
        var rd = new FileReader(); rd.onload = function () {
          var j; try { j = JSON.parse(rd.result); } catch (x) { return toast('JSON 형식이 올바르지 않습니다.', true); }
          var errs = E.validateTrip(j); if (errs.length) return toast('가져오기 실패: ' + errs.slice(0, 2).join(' / '), true);
          if (allTrips().some(function (x) { return x.id === j.id; })) j.id = j.id + '-' + E.uid('').slice(1, 5);
          S.customTrips[j.id] = j; S.activeTrip = j.id; S.tab = 'now'; render(); toast('여행을 가져왔어요: ' + j.title);
        };
        rd.readAsText(tf.files[0]); tf.value = '';
      }; return tf.click();
    }
    if (a === 'reset-trip') { if (!confirm('이 여행의 일정 수정·진행 기록·내 장소를 모두 초기화할까요?')) return; delete S.ts[t.id]; focusId = null; return render(); }
  });

  document.addEventListener('change', function (e) {
    var el = e.target, a = el.dataset && el.dataset.act, s = ts();
    if (el.id === 'tripSel') { S.activeTrip = el.value; focusId = null; return render(); }
    if (a === 'check') { var pg = prog(el.dataset.id); pg.checks = pg.checks || {}; pg.checks[el.dataset.i] = el.checked; return persist(); }
    if (a === 'cost') { var c = el.value === '' ? null : Number(el.value); if (c != null && !(c >= 0)) { toast('지출은 0 이상의 숫자로 입력하세요.', true); return; } prog(el.dataset.id).cost = c; return persist(); }
    if (el.id === 'startDate') { s.startDate = el.value; return render(); }
    if (el.id === 'dayStart') { if (/^\d{2}:\d{2}$/.test(el.value)) { dayMeta(s.day).start = el.value; if (!S.customTrips[trip().id]) { S.dayStarts = S.dayStarts || {}; (S.dayStarts[trip().id] = S.dayStarts[trip().id] || {})[s.day] = el.value; } } return render(); }
  });
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset && el.dataset.act === 'memo') { prog(el.dataset.id).memo = el.value; clearTimeout(el._t); el._t = setTimeout(persist, 400); }
    if (el.id === 'q') { ts().q = el.value; var pos = el.selectionStart; render(); var q = document.getElementById('q'); q.focus(); q.setSelectionRange(pos, pos); }
  });

  /* 기본 여행에 사용자가 추가한 일차·시작시각 복원 */
  function boot() {
  allTrips().forEach(function (t) {
    if (S.extraDays && S.extraDays[t.id]) for (var n = t.days.length + 1; n <= S.extraDays[t.id]; n++) {
      t.days.push({ n: n, label: n + '일차', start: '10:00' }); Object.keys(t.plans).forEach(function (k) { t.plans[k].days[n] = t.plans[k].days[n] || []; });
    }
    var ds = S.dayStarts && S.dayStarts[t.id]; if (ds) t.days.forEach(function (d) { if (ds[d.n]) d.start = ds[d.n]; });
  });
  render();
  }
  TripRegistry.loadManifest('trips/index.json').then(function () { boot(); });
})();
