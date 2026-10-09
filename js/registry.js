/* 여행 데이터 레지스트리: js/trips/*.js 파일이 TripRegistry.register(trip)으로 등록한다. */
(function (root) {
  'use strict';
  var trips = {}, order = [];
  root.TripRegistry = {
    register: function (trip) {
      var errs = root.Engine ? root.Engine.validateTrip(trip) : (trip && trip.id && trip.plans && trip.places ? [] : ['잘못된 여행 데이터']);
      if (errs.length) throw new Error('잘못된 여행 데이터: ' + errs.slice(0, 3).join(' / '));
      if (!trips[trip.id]) order.push(trip.id);
      trips[trip.id] = trip;
    },
    get: function (id) { return trips[id]; },
    /** trips/index.json 매니페스트의 JSON 파일을 모두 불러와 등록한다. 실패한 항목은 건너뛴다. */
    loadManifest: function (url) {
      return fetch(url, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(); return r.json(); }).then(function (files) {
        return Promise.all((files || []).map(function (f) {
          return fetch('trips/' + f, { cache: 'no-cache' }).then(function (r) { return r.json(); })
            .then(function (t) { root.TripRegistry.register(t); }, function () { console.warn('여행 파일을 불러오지 못했습니다:', f); });
        }));
      }).catch(function () { /* 매니페스트가 없어도 앱은 동작한다 */ });
    },
    list: function () { return order.map(function (i) { return trips[i]; }); }
  };
})(window);
