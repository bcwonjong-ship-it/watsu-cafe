# 오정센터 청소년카페 키오스크 시스템 v12f

청소년카페 "마음 휴카페" 시설 관리 시스템 — 키오스크 · 모바일 예약 · 관리자 현황판 · 이용자 관리

## 주요 기능

### 키오스크 (`index.html`)
- 전화번호 키패드 입장 / 미등록 시 회원가입 (개인·단체)
- 가입 후 모바일 로그인 정보 안내 (이름 + 전화번호 뒷4자리)
- **★ 입장/놀거리 선택 화면** — 전화번호 입력 → "입장(휴카페 이용)" / "놀거리 예약(공간·시설)" 선택
- **입장 플로우**: 휴대폰 번호 입력 → 입장 버튼 → "환영합니다" SweetAlert → 키오스크 홈 복귀 (현황판에서 이용시설 "휴카페"로 표시)
- 시설 예약 그리드 (일반 5개 시설 + 관리자 전용 2개)
- **시설별 실시간 대기 인원수 표시** (배지)
- 대기 등록 / 사용 중 시설 대기 가능 안내
- 내 예약 내역 / 이용 횟수 확인 / 퇴장
- 2분 미조작 자동 홈 복귀
- **운영시간(10:00~20:00) 외 예약·대기 차단** 안내
- **태블릿 최적화 레이아웃** — 한 화면에 모두 표시
- 🔒 이용자관리 / 관리자 페이지 바로가기 (비밀번호 인증: `admin1388!`)
- **★ 관리자 로그인** — 전화번호 `00000000000` + 비밀번호 입력 시 관리자 모드
  - 운영시간 무시 가능, 실적 미카운트
  - 관리자 전용 시설(댄스연습실/멀티룸) 접근 가능
  - 요일별 시간대 예약 (화~금 10-20시, 토 10-18시, 일/월 불가)

### 모바일 예약 (`mobile.html`)
- 이름(ID) + 전화번호 뒷4자리(PW) 로그인
- 내 이용 현황 (시설별 종료 버튼, 남은시간/초과시간)
- **대기 호출 확인 플로우**: 관리자 호출 → 🔔 호출됨 표시 → "이용 시작" 버튼으로 확인 → 시설 예약 자동 진행
- **시설별 대기 인원수** 실시간 표시
- 30초 자동 새로고침
- **운영시간 외 예약·대기 차단**

### 관리자 현황판 (`admin.html`)
- 실시간 이용자 카드 (30초 갱신)
- 요약: 현재 이용자 / 오늘 방문 / 시설 이용 / 대기자 수
- **운영시간 상태 배지** (🟢 운영중 / 🔴 운영종료)
- 개별 퇴장, 다중 선택 퇴장, 전체 퇴장
- 시설별 종료 / **10분 단위 시간 연장** (10/20/30/60분 퀵 버튼 + 직접 입력)
- **시설 이용 시작시간 표시** — 남은 시간과 함께 언제부터 이용했는지 확인
- **관리자 시설 직접 추가** — 이용자 카드에서 시설을 직접 배정 (단체 등 대응)
- **대기열 관리 플로우**: 호출 → 사용자 확인 대기 → 관리자 직접 이용시작 가능
- **대기열 대기 경과시간 표시** — 각 대기자의 대기 시간과 호출 경과시간 표시
- 시간초과 알림 (빨간 배너 + 알림음)
- **★ 시설별 이용현황 패널** (v10~v11)
  - 각 시설별 사용률 바 + 세부(방/기기)별 사용 상태 표시
  - 이용자명, 남은시간/초과시간, 빈 슬롯 한눈에 확인
  - 만석(full) / 부분사용(partial) / 여유(free) 시각 구분
  - **⊕ 시간연장 버튼** — 이용 중인 세부 슬롯마다 연장 가능 (v11)
  - **⊗ 이용종료 버튼** — 이용 중인 세부 슬롯마다 개별 종료 가능
  - **대기목록 통합 표시** — 시설별 카드 하단에 대기자 수 + 목록 표시
- **★ 관리자 예약 현황 패널 — 시간표 그리드** (v11 전면 개선)
  - 댄스연습실 / 멀티룸 **분리 블록**으로 각각 표시
  - 요일별 자동 시간대 계산 (화~금 10:00~20:00 / 토 10:00~18:00 / 일·월 불가)
  - **토요일 18:00~20:00 시간 자동 숨김**
  - 슬롯 상태: 예약됨(오렌지) / 빈 슬롯(점선·클릭 예약) / 지난시간(흐림) / **🍚 점심시간(12~13시, 줄무늬)**
  - **빈 슬롯 클릭 → 빠른 예약** (`adminQuickReserve`): 예약자명/용도 SweetAlert 입력 → `note` 필드 저장 → **화면 즉시 표시**
  - **예약 취소** (`cancelAdminReserve`): ❌ 버튼 → DB 레코드 삭제 → 빈 슬롯으로 전환 (재예약 가능)
  - **기존 예약 메모 편집** (`editAdminReserveNote`): ✏️ 버튼 → 예약자명/인원수/용도 수정
  - `facility_reservations.note` 필드 활용
  - 패널 **항상 표시** (예약 없어도 빈 시간표 확인 가능)
  - **관리자 일/월에도 시간표 표시 및 예약 가능**
- **★ 관리자 카드 상단 고정** (v11)
  - `renderUsers()` 정렬: 관리자 → 시설이용자 → 휴카페
  - 관리자 카드: 오렌지 보더 + 노란 배경 + 👑 관리자 배지
- **📊 통계 & 목표 관리**
  - 월간 요약 (성별·연령대별 방문 집계, 보정값 반영)
  - **일별 현황 테이블** — 날짜별 상세 집계 + 작년 동월 비교열
  - **통계 수치 보정 (DB 저장)** — 일별 행 클릭 → 항목별 +/- 보정값 편집 + 수정 사유 입력
  - **보정값 → 연간 실적 반영** — 보정값이 연간 목표 진행률에도 자동 합산
  - **보정 수정 내역 확인** — "보정 내역" 버튼으로 월별 수정 이력 조회
  - **수동 일별 데이터 입력** — 지난 달도 추가 입력 가능
  - 작년 실적 입력 / 작년 비교 배너
  - 연간 목표 설정 / 진행률 시각화 / 월별 미니 바 차트
  - 통계 데이터 공유 (DB 기반, 다른 기기 동기화)
- **🔒 내보내기 비밀번호 잠금** (비밀번호: `admin1388!`)
- Google Sheets CSV 내보내기
- **이용자 관리 페이지 바로가기**

### 통계 현황판 (`stats.html`)
- **독립 페이지** — 별도 URL로 접근 가능한 통계 전용 현황판
- **★ 수동 조회 모드** (v12c) — 60초 자동갱신 폐지 → "조회" 버튼으로 수동 갱신 (egress 절감)
- 페이지 로드 시 1회만 자동 조회
- 월 총 방문 / 운영 일수 / 단체 방문 / 일평균 요약 카드
- 연간 목표 진행률 (프로그레스 바 + 월별 미니 바 차트)
- 성별·학년별 현황 그리드
- 일별 현황 테이블 (보정값 반영, 작년 비교)
- 작년 대비 비교 배너
- 모바일 반응형 레이아웃

### 이용자 관리 (`members.html`)
- **🔒 비밀번호 잠금** (비밀번호: `admin1388!`, 세션 중 유지)
- **회원 목록** 조회 (최근 가입순 정렬)
- **검색** — 이름 또는 전화번호로 실시간 검색
- **연령대 필터** — 전체 / 초등 / 중등 / 고등 / 성인
- **회원 정보 수정** — 이름, 전화번호, 생년월일, 성별
- **회원 삭제** (확인 다이얼로그 포함)
- 관리자 / 키오스크 페이지 바로가기

## v12f 변경사항 — 연간 실적 + 대기 예상시간 + 토요일 노래방 20분 (최신, 2026-09-04)

### 1. 올해 전체 이용실적 표시
- **admin.html 통계모달**: 연간 목표 섹션 하단에 " 년 전체 이용실적" 카드 (총 방문 / 운영 개월 / 월평균 / 일평균)
- **stats.html**: 성별·학년별 현황 위에 연간 실적 요약 카드 4개
- 데이터가 있는 월만 카운트 (운영 개월)

### 2. 대기 예상 시간 표시
- **`Service.getWaitEstimate(facility, detail)`** — 현재 이용자 남은시간 + 앞 대기자 × 기본 이용시간으로 총 예상 대기시간 계산
- **키오스크**: 서브메뉴에서 "사용 중" 클릭 → 보라색 카드로 예상 대기시간 + 세부정보 표시
- **모바일**: 동일하게 대기 등록 전 예상시간 표시
- **관리자 현황판**: 시설 이용현황 패널 대기목록에 각 대기자별 예상 대기시간 표시 (⏱약 XX분)

### 3. 토요일 노래방 20분 자동 설정
- **`FacilityConfig.getTimeLimit(facility)`** — 요일별 동적 시간제한 반환
- 토요일 노래방: 20분 / 그 외: 30분 (기본)
- 예약 생성 시 `time_limit` DB 저장 → 모든 화면에 자동 반영

### 4. members in.() 배치 조회 (400 에러 방지)
- **`Service._batchGetMembers(phones)`** — 50개씩 나눠서 조회 (URL 길이 초과 방지)
- `getMonthlyStats`, `getDailyBreakdown`, `getYearlyTotal` 3곳 적용

### 5. 캐시 버전 범프
- 전체 5개 HTML `?v=20260904a` 적용

## v12e 변경사항 — 듀얼 라이트 + 페일오버 (2026-07-31)

### 1. 듀얼 라이트 (Dual Write) — 양쪽 DB 동시 쓰기
- **`_syncToOtherDB()`** 신규 함수 — 상대편 DB에 fire-and-forget 백그라운드 동기화
- **`API.create()`**: 메인 DB 성공 후 → 동일 데이터(id/created_at 포함)를 상대편 DB에 POST
- **`API.update()`**: 메인 DB PATCH 후 → 동일 PATCH를 상대편 DB에도 적용
- **`API.remove()`**: 메인 DB DELETE 후 → 동일 DELETE를 상대편 DB에도 적용
- **비차단(non-blocking)**: 상대편 동기화 실패해도 메인 응답에 영향 없음 (console.warn만)
- **전체 쓰기 경로 커버**: Service 함수 + admin.js + gs-sync.js 모두 `API.create/update/remove` 호출 → 자동 적용

### 2. DBManager — Primary/Secondary DB 자동 전환
- **`DBManager` 객체** 추가 (api.js) — Primary/Secondary Supabase 프로젝트 설정 관리
- **Primary DB**: `ymzcrjdzjolbebdjdilr.supabase.co`
- **Secondary DB**: `fqgsieulcxekejtfofiq.supabase.co` (페일오버용)
- 상태 추적: `_current` (primary/secondary), `_failedAt` (실패 시각)
- **5분 복구 탐색**: Secondary 사용 중 5분 경과 시 Primary로 1회 테스트 → 성공 시 자동 복귀

### 3. API._fetchWithRetry() 페일오버 로직
- **폴백 대상 에러**: 402 (Supabase paused), 5xx (서버 오류), 네트워크 에러
- **3단계 전략**: (A) Primary 복구 탐색 → (B) 현재 활성 DB 시도+재시도 → (C) 상대 DB 폴백
- **비폴백 에러** (401/403/404/409): 즉시 실패 (무의미한 전환 방지)
- **양쪽 모두 실패 시**: 원래 에러 그대로 던짐 + 콘솔 경고

### 4. API CRUD 메서드 동적 URL 생성
- `list`, `get`, `create`, `update`, `remove` — 모두 `urlPath`만 전달
- `_fetchWithRetry()` 내부에서 `DBManager.getConfig().url + '/rest/v1/' + urlPath` 합성
- 헤더(`apikey`, `Authorization`)도 활성 DB 키로 동적 설정

### 5. 캐시 버전 범프
- 전체 5개 HTML `?v=20260731a` 적용

### 데이터 동기화 아키텍처
```
[쓰기 요청] (create/update/remove)
  ├─ 메인 DB (활성): 동기 처리 → 응답 반환 (사용자에게)
  └─ 상대편 DB: fire-and-forget 비동기 → 실패해도 무시 (콘솔 경고만)

[읽기 요청] (list/get)
  └─ 현재 활성 DB에서만 읽기 (페일오버 로직 적용)
```

### 페일오버 동작 흐름
```
Primary DB 요청
  └─ 성공 → 정상 응답 (+ Secondary에 듀얼 라이트 동기화)
  └─ 실패(402/5xx/네트워크) → 재시도(max 2회)
     └─ 여전히 실패 → Secondary DB로 폴백(1회 재시도)
        └─ 성공 → DBManager가 Secondary로 전환, 이후 모든 요청 Secondary 사용
        └─ 실패 → 양쪽 모두 다운, 에러 던짐

[5분 후] Secondary 사용 중 → Primary 1회 테스트
  └─ 성공 → Primary로 복귀
  └─ 실패 → 타이머 리셋, 5분 후 재시도
```

## v12c 변경사항 — Egress 최적화 (2026-07-28)

### 1. API 서버사이드 필터링 전면 적용 (api.js v7+)
- **모든 `API.list()` 호출에 PostgREST 서버사이드 필터** 적용 — 테이블 전체 다운로드 제거
- **`Util.monthRange(monthStr)`** — 월 범위 필터용 `['YYYY-MM-01', 'YYYY-MM+1-01']` 생성
- **`Util.yearRange(year)`** — 연 범위 필터용 `['YYYY-01-01', 'YYYY+1-01-01']` 생성
- **`API.list()` 배열 파라미터 지원** — `{ date: ['gte.X', 'lt.Y'] }` → PostgREST 다중 필터 (range query)
- **`API._CACHE_TTL: 5000`** — 5초 캐시 (한 갱신 사이클 내 동일 쿼리 흡수)
- 적용 함수: `findMemberByPhone`, `processSearch`, `processExit`, `reserveFacility`, `getActiveUsers`, `getMonthlyStats`, `getDailyBreakdown`, `getYearlyTotal`, `getMonthlyStatsWithAdj`, `getOverdueReservations`, `getOccupiedFacilities`, `getUserActiveReservations`, `getUserVisitCount`, `joinWaitlist`, `getWaitlist`, `getAllWaitlists`, `getWaitlistCounts`, `getMyWaitlist`, `processAllExit` 등
- **`members` in.() 최적화** — 관련 access_log에서 phone 목록 추출 → `phone: 'in.(p1,p2,...)'`으로 필요한 회원만 조회

### 2. admin.js `loadSummary()` 서버사이드 필터 (v9.3)
- `daily_visitors`: `date: eq.today` (오늘 방문자만)
- `facility_reservations`: `date: eq.today, exit_time: eq.` (오늘 활성 예약만)
- `waitlist`: `date: eq.today, status: in.(waiting,called)` (오늘 활성 대기만)

### 3. stats.html 수동 조회 모드 전환
- **60초 자동갱신 제거** (setInterval 삭제)
- **"조회" 버튼** — 월 선택 후 수동 클릭으로 갱신 (`Service.clearStatsCache()` + `loadAllStats()`)
- **수동 조회 배지** — `<i class="fas fa-hand-pointer"></i> 수동 조회` 표시
- 페이지 최초 로드 시 1회만 자동 조회

### 4. admin.html 통계모달 "조회" 버튼 추가
- 월 선택 `onchange` 자동호출 제거
- "조회" 버튼 클릭 시 `Service.clearStatsCache()` → `onStatsMonthChange()` 실행
- 불필요한 API 호출 방지 (사용자 의도적 조회만)

### 5. 캐시 버전 범프
- 전체 5개 HTML `?v=20260728a` 적용

### Egress 절감 효과
| 영역 | 기존 | 변경 후 |
|------|------|---------|
| loadSummary (admin.html) | 3 테이블 전체 다운로드 (30초마다) | 오늘 데이터만 필터 (1~5행) |
| getActiveUsers | access_logs 전체 + members 전체 | 오늘 활성만 + in.() 최소 조회 |
| getMonthlyStats | daily_visitors 전체 + members 전체 | 해당 월만 + in.() 조회 |
| stats.html | 60초마다 자동 갱신 (24시간 = 1440회) | 수동 조회 (사용자 필요 시만) |

## v12 변경사항 (v12a, v12b)

### 1. API 에러 처리 대폭 개선 (v12b)
- **`_fetchWithRetry()` 재시도 로직** (api.js) — 네트워크 오류, 429(Rate Limit), 5xx 서버 에러 시 최대 2회 자동 재시도 (지수 백오프)
- **HTTP 상태코드별 사용자 친화적 에러 메시지** — 401/402/403/404/429/5xx 각각 명확한 한국어 안내
- 키오스크 로그인 실패 시: "서버 연결 오류" + 실제 원인 표시 (기존: "처리 중 문제가 발생했습니다")
- 관리자 현황판 로딩 실패 시: 상세 에러 메시지 + "30초 후 자동 재시도합니다" 안내 (기존: "데이터 로딩 실패")
- 모바일/회원관리 로그인 오류도 동일하게 개선
- **전체 5개 JS 파일의 catch 블록 에러 메시지 통일** (api.js, kiosk.js, admin.js, mobile.js, members.js)

### 2. 키오스크 입장 플로우 완성 (v12a)
- **입장/놀거리 선택 화면** (`view-choice`) CSS 추가 — 버튼 디자인, 호버 효과, 반응형 레이아웃
- **`escapeHtml()` 함수 추가** (kiosk.js) — `handleChoiceEnter()`에서 `ReferenceError` 발생하던 치명적 버그 수정
- 입장 버튼 클릭 → "환영합니다" SweetAlert → `goHome()`으로 키오스크 홈 복귀
- 현황판에서 이용시설 "휴카페"로 정상 표시 (시설 예약 없이 access_log만 존재)

### 3. 댄스연습실/멀티룸 예약 실패 버그 수정 (v12a)
- **`reserveFacility()` note 필드 안전 폴백** (api.js) — Supabase에 `note` 컬럼 미존재 시 `API.create()` 실패 → catch 블록에서 `note` 제거 후 재시도 → 성공 후 PATCH로 별도 저장
- **`adminQuickReserve()` catch 블록 개선** (admin.js) — 실패 시 에러 메시지에 실제 원인 포함
- 예약자명/인원 입력 → note 필드 저장 → 현황판 시간표에서 예약자명 표시 (`displayInfo = noteInfo || rsvName`)

### 4. 캐시 버전 범프
- 전체 5개 HTML `?v=20260724e` 적용

### ⚠️ 알려진 이슈: Supabase 402 에러
- Supabase 무료 플랜 프로젝트가 일시 중지(paused)되면 모든 API 호출이 402를 반환합니다
- **해결 방법**: [Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트를 재활성화(Resume)해주세요
- 코드 수정으로 해결할 수 없는 서비스 인프라 이슈입니다

## v11 변경사항

### 1. 관리자 예약 현황 — 시간표 그리드 (admin.html)
- `loadAdminReserves()` 전면 재작성
- 댄스연습실 / 멀티룸 **각각 독립 블록**으로 분리 표시
- 요일별 자동 시간대: 화~금 10:00~20:00 (10슬롯), 토 10:00~18:00 (8슬롯)
- **토요일 18:00~20:00 자동 숨김**, 일/월 예약 불가 안내
- 슬롯 4가지 상태: `booked`(활성·오렌지), `ended`(종료·회색), `empty`(빈·클릭예약), `past`(지난시간·흐림)
- **빈 슬롯 클릭 → 빠른 예약** (`adminQuickReserve`): 예약자명/용도 SweetAlert 입력 → `note` 필드 저장
- **기존 예약 메모 편집** (`editAdminReserveNote`): ✏️ 버튼 → 예약자명/인원수/용도 수정
- 패널 **항상 표시** (예약 없어도 빈 시간표 확인 가능)

### 2. 시설별 이용현황 — 시간연장 + 종료 + 대기목록
- 각 이용 중인 세부 슬롯에 **⊕ 연장 버튼** + **⊗ 종료 버튼** 나란히 배치
- 연장 버튼 → `extendTime()` 호출 (10/20/30/60분 퀵 + 직접입력)
- **시설별 대기목록 통합 표시**: 시설 카드 하단에 대기자 수 + 번호 + 이름 + 대기시간 + 호출 여부

### 3. 관리자 카드 상단 고정
- `renderUsers()` 정렬: 관리자(ADMIN_PHONE) → 시설이용자 → 휴카페 이용자
- 관리자 카드 시각 구분: 오렌지 보더 + 노란 배경 + 👑 관리자 인라인 배지
- 배지-퇴장 버튼 겹침 해결 (CSS `::after` → JS 인라인 `<span>` 방식)

### 4. 예약자명/인원수 관리 기능
- `facility_reservations.note` 필드 활용
- 관리자 예약 시 예약자명/인원수/용도 입력 가능
- 시간표 그리드에서 예약 정보 표시 + 편집

## v10 변경사항

### 1. 시설별 이용현황 패널 (admin.html)
- 관리자 현황판에 **시설별 이용현황 그리드** 추가
- 모임방/노래방/탁구장/닌텐도/보드게임 각 시설별 카드 표시
- 카드마다: 아이콘 + 시설명 + 사용률 배지(n/m) + 사용률 바
- 세부 항목(방/기기)별로 이용자명, 남은시간/초과시간, 빈 슬롯 표시
- 상태별 색상: 만석(핑크) / 부분사용(파랑) / 여유(기본)

### 2. 관리자 계정 시스템
- `AdminAuth` 객체로 관리자 인증 관리
- 관리자 전화번호: `00000000000`, 비밀번호: `admin1388!`
- 관리자 로그인/로그아웃 시 실적(daily_visitors) 미카운트
- 관리자는 운영시간 외에도 시설 예약 가능
- 관리자 전용 시설: 댄스연습실, 멀티룸 (`adminOnly: true`)

### 3. 예약 규칙 개선
- **모든 시설 독립 공존** — `canCoexist()` 항상 true (닌텐도+모임방 등 동시 예약 가능)
- **모임방 1개 제한** — 모임방은 시설 레벨에서 1개만 예약 가능
- **관리자 중복 예약 허용** — 관리자는 동일 시설 중복 예약 가능
- **요일별 시간대** — 댄스연습실/멀티룸: 화~금 10-20시, 토 10-18시, 일/월 불가

### 4. 비밀번호 통일
- 모든 인증 비밀번호를 `admin1388!`로 통일

## 파일 구조

```
index.html          키오스크 (전화번호 입장 → 시설 예약)
mobile.html         모바일 (이름+뒷4자리 로그인 → 예약/대기/확인)
admin.html          관리자 (실시간 현황, 시설이용현황, 관리자예약, 대기열, 퇴장, 통계)
stats.html          통계 현황판 (독립 페이지, 60초 자동 갱신)
members.html        이용자 관리 (비밀번호 잠금 + 회원 조회/수정/삭제)
css/style.css       공통 스타일시트 (v12 — view-choice 입장/놀거리 선택 CSS 추가)
js/api.js           공통 API + 비즈니스 로직 (AdminAuth, FacilityConfig, canCoexist, 관리자 예약 규칙)
js/kiosk.js         키오스크 UI 로직 (관리자 로그인, authAndGo, showAdminTimeMenu)
js/mobile.js        모바일 UI 로직
js/admin.js         관리자 UI 로직 (v11 — 시간표 그리드, 빠른예약, 메모편집, 연장/종료 버튼)
js/members.js       이용자 관리 UI 로직
js/gs-sync.js       Google Sheets 연동
images/maeum-i.png  마음이 캐릭터 이미지
```

## 시설 및 규칙

| 시설 | 하위 | 시간제한 | 대기열 | 관리자전용 |
|------|------|---------|--------|-----------|
| 모임방 | 노랑방,파랑방,핑크방,초록방 | **60분** | ✅ | ❌ |
| 노래방 | 1번방,2번방,3번방 | 30분 | ✅ | ❌ |
| 탁구장 | 탁구대 | 30분 | ✅ | ❌ |
| 닌텐도 | 닌텐도1~4 | **60분** | ✅ | ❌ |
| 보드게임 | (없음) | 무제한 | ❌ | ❌ |
| 댄스연습실 | 시간대(요일별) | 시간대 자동종료 | ❌ | ✅ |
| 멀티룸 | 시간대(요일별) | 시간대 자동종료 | ❌ | ✅ |

## 데이터 모델

### Supabase 테이블

| 테이블 | 주요 필드 |
|--------|---------|
| members | id, phone, name, birthdate, gender, reg_type, member_code, registered_at |
| access_logs | id, date, entry_time, exit_time, phone, name, note, entry_timestamp |
| facility_reservations | id, date, entry_time, exit_time, phone, name, facility, detail, time_limit, extended_count, **note** |
| daily_visitors | id, date, phone, name, gender, age_group, note, group_count |
| waitlist | id, date, facility, detail, phone, name, queue_number, status, created_at, called_at |

### 프로젝트 내장 DB 테이블 (RESTful Table API)

| 테이블 | 주요 필드 | 엔드포인트 |
|--------|---------|--------|
| **stats_adjustments** | id, date, adj_data (JSON), updated_at | `tables/stats_adjustments` |
| **adj_history** | id, date, action, adj_data (JSON), prev_data (JSON), memo, created_at | `tables/adj_history` |
| **yearly_settings** | id, setting_key, setting_value, updated_at | `tables/yearly_settings` |

### localStorage 키 (DB 폴백용)

| 키 | 용도 |
|----|------|
| `cafe_yearly_goals` | 연간 목표 인원수 `{year: number}` (DB 폴백) |
| `cafe_prev_year_monthly_{year}` | 작년 월별 실적 `{MM: {total: number}}` (DB 폴백) |
| `cafe_stats_adj_{yyyy-MM-dd}` | 일별 보정값 백업 (DB 폴백용) |

### waitlist 상태 흐름
```
waiting → called → (confirmWaitlistEntry) → completed + 시설예약 생성
                 → cancelled (취소)
```

## 기술 스택

- HTML5, CSS3, ES6+ JavaScript (서버 없는 정적 웹앱)
- 폰트: Pretendard (CDN)
- 아이콘: Font Awesome 6.4.0
- 다이얼로그: SweetAlert2
- 데이터 저장: Supabase REST API (핵심 데이터) + 프로젝트 RESTful Table API (보정값/히스토리/통계설정) + localStorage (DB 폴백)
- Google Sheets 연동: CSV 내보내기

## 접속 URL

- **키오스크**: `index.html`
- **모바일 예약**: `mobile.html`
- **관리자 현황판**: `admin.html`
- **📊 통계 현황판**: `stats.html` (독립 페이지, 60초 자동 갱신)
- **이용자 관리**: `members.html` (🔒 비밀번호: `admin1388!`)

## 향후 개선 사항

- 시설별 이용 통계 (시설별 인기도 분석)
- 웹 푸시 알림 (대기 호출 시)
- 관리자 PIN 변경 기능 UI
- 회원 마이페이지 (이용 내역, QR 카드)
- WebSocket 기반 실시간 업데이트 (현재 30초 폴링)
