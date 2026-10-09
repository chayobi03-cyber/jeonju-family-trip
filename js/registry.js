/* 여행 데이터 레지스트리: js/trips/*.js 파일이 TripRegistry.register(trip)으로 등록한다. */
(function (root) {
  'use strict';
  var trips = {}, order = [];
  root.TripRegistry = {
    register: function (trip) {
      if (!trip || !trip.id || !trip.plans || !trip.places) throw new Error('잘못된 여행 데이터');
      if (!trips[trip.id]) order.push(trip.id);
      trips[trip.id] = trip;
    },
    get: function (id) { return trips[id]; },
    list: function () { return order.map(function (i) { return trips[i]; }); }
  };
})(window);
