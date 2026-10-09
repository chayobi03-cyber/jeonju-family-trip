/* 순수 일정 로직 (DOM 비의존). 브라우저: window.Engine, Node: module.exports */
(function (root) {
  'use strict';

  function uid(prefix) {
    return (prefix || 'i') + '-' + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function validCoord(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }

  function hasCoord(p) { return !!p && validCoord(p.lat, p.lon); }

  function haversineKm(a, b) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /** 계획용 이동 추정치. 실시간 교통은 반영하지 않는다. */
  function travel(a, b) {
    if (!hasCoord(a) || !hasCoord(b)) return { mode: 'none', min: 0, km: 0 };
    var km = haversineKm(a, b);
    if (km < 0.05) return { mode: 'walk', min: 0, km: km };
    if (km <= 1.2) return { mode: 'walk', min: Math.max(3, Math.round(km * 1.3 / 4 * 60)), km: km };
    return { mode: 'car', min: Math.round(km * 1.4 / 25 * 60) + 5, km: km };
  }

  function toMin(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return m ? (+m[1]) * 60 + (+m[2]) : 9 * 60;
  }
  function fmt(min) {
    min = Math.max(0, Math.round(min));
    var h = Math.floor(min / 60) % 24, m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  /**
   * items: [{id,p?,rest?,dur?,included?}]; placesById: {id:Place}
   * 포함된 항목만 시간을 계산한다. 제외 항목은 start/end가 null.
   */
  function timeline(items, placesById, startTime) {
    var t = toMin(startTime), prev = null, rows = [];
    items.forEach(function (it) {
      var place = it.p ? placesById[it.p] : null;
      var dur = Math.max(0, +(it.dur != null ? it.dur : (place && place.dur) || 30));
      var row = { item: it, place: place, dur: dur, included: it.included !== false, start: null, end: null, travel: null };
      if (row.included) {
        if (prev && place && prev.place) {
          var tr = travel(prev.place, place);
          if (tr.mode !== 'none') { row.travel = tr; t += tr.min; }
        }
        row.start = t; t += dur; row.end = t;
        if (place || prev) prev = row.place ? row : prev;
      }
      rows.push(row);
    });
    return rows;
  }

  /** 일정 항목 검증: 음수 체류시간, 존재하지 않는 장소 */
  function validateItems(items, placesById) {
    var errs = [];
    items.forEach(function (it, i) {
      if (it.p && !placesById[it.p]) errs.push((i + 1) + '번째 항목의 장소를 찾을 수 없습니다.');
      if (it.dur != null && !(+it.dur >= 0)) errs.push((i + 1) + '번째 항목의 체류시간이 올바르지 않습니다.');
    });
    return errs;
  }

  /** days: {1:[items],2:[items]} → 누락/제외된 필수 방문지 */
  function mandatoryStatus(mandatory, days) {
    var seen = {};
    Object.keys(days).forEach(function (d) {
      days[d].forEach(function (it) {
        if (it.p && mandatory.indexOf(it.p) >= 0) {
          seen[it.p] = seen[it.p] === 'in' ? 'in' : (it.included === false ? 'out' : 'in');
        }
      });
    });
    var missing = [], excluded = [];
    mandatory.forEach(function (pid) {
      if (!seen[pid]) missing.push(pid);
      else if (seen[pid] === 'out') excluded.push(pid);
    });
    return { missing: missing, excluded: excluded };
  }

  /** 누락된 필수 방문지를 기본 계획의 위치에 복구한다. 제외 상태(사용자 선택)는 존중. */
  function repairMandatory(mandatory, days, defaultDays) {
    var st = mandatoryStatus(mandatory, days), fixed = [];
    st.missing.forEach(function (pid) {
      Object.keys(defaultDays).some(function (d) {
        var idx = defaultDays[d].findIndex(function (it) { return it.p === pid; });
        if (idx < 0) return false;
        var copy = JSON.parse(JSON.stringify(defaultDays[d][idx]));
        var list = days[d] || (days[d] = []);
        list.splice(Math.min(idx, list.length), 0, copy);
        fixed.push(pid);
        return true;
      });
    });
    return fixed;
  }

  /** 항목 이동. 필수 방문지끼리의 순서 교환은 거부한다. */
  function move(items, idx, dir, mandatory) {
    var to = idx + dir;
    if (idx < 0 || idx >= items.length || to < 0 || to >= items.length) return { ok: false, reason: '더 이상 이동할 수 없습니다.' };
    var a = items[idx], b = items[to];
    if (a.p && b.p && mandatory.indexOf(a.p) >= 0 && mandatory.indexOf(b.p) >= 0)
      return { ok: false, reason: '필수 방문지끼리의 순서는 임의로 바꾸지 않습니다.' };
    var out = items.slice(); out[idx] = b; out[to] = a;
    return { ok: true, items: out };
  }

  /** 오늘 진행 중인 항목: 완료/건너뜀이 아닌 첫 번째 포함 항목 */
  function currentIndex(items, progress) {
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.included === false) continue;
      var st = (progress[it.id] || {}).status;
      if (st !== 'done' && st !== 'skipped') return i;
    }
    return -1;
  }

  function dayStats(items, progress) {
    var inc = items.filter(function (i) { return i.included !== false; });
    var done = inc.filter(function (i) { return (progress[i.id] || {}).status === 'done'; }).length;
    var skipped = inc.filter(function (i) { return (progress[i.id] || {}).status === 'skipped'; }).length;
    return { total: inc.length, done: done, skipped: skipped };
  }

  function directionsUrl(p, mode) {
    if (!p) return null;
    var dest = hasCoord(p) ? p.lat + ',' + p.lon : (p.q || p.addr || p.name);
    return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(dest) +
      '&travelmode=' + (mode === 'car' ? 'driving' : 'walking');
  }

  var api = { uid: uid, esc: esc, validCoord: validCoord, hasCoord: hasCoord, haversineKm: haversineKm, travel: travel,
    toMin: toMin, fmt: fmt, timeline: timeline, validateItems: validateItems, mandatoryStatus: mandatoryStatus,
    repairMandatory: repairMandatory, move: move, currentIndex: currentIndex, dayStats: dayStats, directionsUrl: directionsUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Engine = api;
})(typeof window !== 'undefined' ? window : globalThis);
