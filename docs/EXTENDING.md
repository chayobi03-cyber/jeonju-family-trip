# 확장 가이드

앱은 **여행 데이터(`js/trips/*.js`)**, **순수 일정 로직(`js/engine.js`)**, **저장소(`js/storage.js`)**, **화면(`js/app.js`)** 으로 분리되어 있습니다. 빌드 도구 없이 정적 파일만으로 동작합니다.

## 새 여행지 추가 (코드)
1. `js/trips/jeonju.js`를 복사해 `js/trips/<새이름>.js`를 만들고 `id`(고유), `title`, `dest`, `days`, `places`, `plans`를 수정합니다.
2. `index.html`의 `jeonju.js` 스크립트 태그 아래에 새 파일을 추가합니다.
3. `node tests/engine.test.js`로 필수 방문지·타임라인 규칙이 유지되는지 확인합니다.

### 데이터 스키마
| 필드 | 설명 |
|---|---|
| `days[]` | `{n, label, start}` 일차와 시작 시각(HH:MM) |
| `mandatory[]` | 필수 방문지 place id. 모든 대안에 포함·복구되며 필수끼리 순서 교환은 거부됨 |
| `places[]` | `{id,name,cat,lat,lon,dur,desc,hours,tips[],checks[],food[],approx}` — `checks`는 방문 전 확인 체크리스트, `approx:true`는 좌표 근사 표시. 좌표가 없는 장소도 허용 |
| `plans{}` | 대안(균형/체험/여유 등 개수 제한 없음). `days[n]`은 `{id,p,dur?,included?}` 배열 (`p`=place id, 장소 없는 일정은 `rest:"이름"`) |

## 앱 안에서 만들기 (코드 없이)
상단 「＋ 새 여행」으로 새 여행을 만들고, 「장소」 탭에서 내 장소를 등록해 일정에 추가합니다. 「설정」에서 일차 추가, 백업/복원이 가능합니다.

## 확장 지점
- **장소 카테고리**: `app.js`의 `CATS`에 추가.
- **이동 추정**: `engine.js`의 `travel()`만 교체하면 도보/차량 규칙을 바꿀 수 있습니다 (실시간 교통은 범위 밖).
- **저장소 교체**: `Storage`의 `load/save/photos` 인터페이스만 지키면 서버 동기화 등으로 대체 가능합니다.
- **가족 간 공유**: 현재는 JSON 내보내기/가져오기가 공유 수단입니다.
