/**
 * 오정센터 청소년카페 - 공통 API 유틸리티 v7+ (Supabase 버전 - egress 최적화)
 *
 * ★ v7 변경사항 (egress 절감)
 * - API.list() 호출 시 서버사이드 필터(date/phone/facility/status/exit_time)를 적용
 * - members 조회도 phone=eq./phone=in.() 필터 사용
 * - API._CACHE_TTL 2초 → 5초 (한 갱신 사이클 내 중복 조회 흡수)
 * ★ v12 기능 유지: AdminAuth, adminOnly, note 폴백, 재시도 로직
 * ★ v12d: Supabase 듀얼 DB 페일오버 — Primary 실패 시 Secondary 자동 전환
 * ★ v12e: 듀얼 라이트 — 쓰기(create/update/remove) 시 양쪽 DB 동시 기록
 */

// ===== ★ Supabase Primary DB 설정 =====
const SUPABASE_URL = 'https://ymzcrjdzjolbebdjdilr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_kmYOmZkiGKpFsHbgm7J95g_vHDGMGVf';

// ===== ★ Supabase Secondary DB 설정 (페일오버용) =====
const SUPABASE_URL_2 = 'https://fqgsieulcxekejtfofiq.supabase.co';
const SUPABASE_KEY_2 = 'sb_publishable_qoWk8V1u5PYcaIFRlSUmFw_yRl5tVEd';

// ===== ★ v12d: DB 매니저 — Primary/Secondary 자동 전환 =====
const DBManager = {
  _primary:   { url: SUPABASE_URL,   key: SUPABASE_KEY,   label: 'Primary' },
  _secondary: { url: SUPABASE_URL_2, key: SUPABASE_KEY_2, label: 'Secondary' },
  _current: 'primary',            // 'primary' | 'secondary'
  _failedAt: 0,                   // Primary 실패 시각 (timestamp)
  _RECOVERY_CHECK_MS: 5 * 60000, // 5분마다 Primary 복구 시도

  /** 현재 활성 DB 설정 반환 */
  getConfig() {
    return this._current === 'primary' ? this._primary : this._secondary;
  },

  /** 현재 어떤 DB를 쓰는지 라벨 반환 */
  getLabel() {
    return this.getConfig().label;
  },

  /** Primary 사용중인지 */
  isPrimary() {
    return this._current === 'primary';
  },

  /** Secondary로 전환 */
  switchToSecondary() {
    if (this._current === 'secondary') return; // 이미 전환됨
    this._current = 'secondary';
    this._failedAt = Date.now();
    console.warn('[DBManager] ⚠️ Primary DB 실패 → Secondary DB로 전환됨');
  },

  /** Primary로 복귀 */
  switchToPrimary() {
    if (this._current === 'primary') return;
    this._current = 'primary';
    this._failedAt = 0;
    console.info('[DBManager] ✅ Primary DB로 복귀됨');
  },

  /** Primary 복구 확인 시점인지 (5분 경과) */
  shouldTryPrimaryRecovery() {
    if (this._current === 'primary') return false;
    return Date.now() - this._failedAt >= this._RECOVERY_CHECK_MS;
  },

  /** 상대편(폴백 대상) DB 설정 반환 */
  getFallbackConfig() {
    return this._current === 'primary' ? this._secondary : this._primary;
  }
};

// ===== 공통 헬퍼 =====
const Util = {
  cleanPhone(phone) {
    return String(phone || '').replace(/[^0-9]/g, '');
  },
  formatPhone(phone) {
    const p = this.cleanPhone(phone);
    if (p.length === 11) return `${p.slice(0,3)}-${p.slice(3,7)}-${p.slice(7)}`;
    if (p.length === 10) return `${p.slice(0,3)}-${p.slice(3,6)}-${p.slice(6)}`;
    return phone;
  },
  phoneLast4(phone) {
    const p = this.cleanPhone(phone);
    return p.slice(-4);
  },
  todayStr() {
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    return kst.toISOString().slice(0, 10);
  },
  timeStr() {
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    return kst.toTimeString().slice(0, 8);
  },
  nowKST() {
    const now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
  },
  currentHour() { return this.nowKST().getHours(); },
  currentMinute() { return this.nowKST().getMinutes(); },
  thisMonth() { return this.todayStr().slice(0, 7); },
  // ★ v7: 'YYYY-MM' → [시작일(포함), 다음달 시작일(미포함)] — PostgREST range 필터용
  monthRange(monthStr) {
    const [y, m] = monthStr.split('-').map(Number);
    const start = `${monthStr}-01`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    const end = `${ny}-${String(nm).padStart(2, '0')}-01`;
    return [start, end];
  },
  // ★ v7: 'YYYY' → [시작일(포함), 다음해 시작일(미포함)]
  yearRange(year) {
    const y = parseInt(year, 10);
    return [`${y}-01-01`, `${y + 1}-01-01`];
  },
  getAgeGroup(birth) {
    if (!birth) return '일반';
    const birthYear = new Date(birth).getFullYear();
    if (isNaN(birthYear)) return '일반';
    const age = new Date().getFullYear() - birthYear + 1;
    if (age >= 8 && age <= 13) return '초등';
    if (age >= 14 && age <= 16) return '중등';
    if (age >= 17 && age <= 19) return '고등';
    if (age >= 20 && age <= 24) return '후기청소년';
    return '성인';
  },
  showLoading(show) {
    const el = document.getElementById('loading-overlay');
    if (el) el.style.display = show ? 'flex' : 'none';
  },
  getElapsedMinutes(entryTimeStr) {
    try {
      const [hh, mm, ss] = entryTimeStr.split(':').map(Number);
      const now = this.nowKST();
      const entry = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, ss || 0);
      return Math.floor((now - entry) / 60000);
    } catch(e) { return 0; }
  },
  isOperatingHours() {
    const h = this.currentHour();
    return h >= 10 && h < 20;
  }
};

// ===== ★ exit_time 체크 헬퍼 (빈 문자열/null/undefined 모두 처리) =====
function isExitEmpty(val) {
  return !val || String(val).trim() === '';
}

// ===== 시설 설정 =====
const FacilityConfig = {
  facilities: {
    '모임방': { icon: '🏠', subs: ['노랑방','파랑방','핑크방','초록방'], timeLimit: 60, type: 'room', hasWaitlist: true },
    '노래방': { icon: '🎤', subs: ['1번방','2번방','3번방'], timeLimit: 30, type: 'room', hasWaitlist: true },
    '탁구장': { icon: '🏓', subs: ['탁구대'], timeLimit: 30, type: 'sport', hasWaitlist: true },
    '닌텐도': { icon: '🎮', subs: ['닌텐도1','닌텐도2','닌텐도3','닌텐도4'], timeLimit: 60, type: 'game', hasWaitlist: true },
    '보드게임': { icon: '🎲', subs: [], timeLimit: 0, type: 'game', hasWaitlist: false },
    '댄스연습실': { icon: '💃', subs: 'timeslot', timeLimit: 0, type: 'timeslot', hasWaitlist: false, adminOnly: true },
    '멀티룸': { icon: '🖥️', subs: 'timeslot', timeLimit: 0, type: 'timeslot', hasWaitlist: false, adminOnly: true }
  },
  waitlistFacilities: ['모임방', '노래방', '탁구장', '닌텐도'],

  // ★ v12e: 요일별 동적 시간제한 반환 (토요일 노래방 20분)
  getTimeLimit(facility) {
    const config = this.facilities[facility];
    if (!config) return 0;
    // 토요일(6)이고 노래방이면 20분
    if (facility === '노래방' && Util.nowKST().getDay() === 6) {
      return 20;
    }
    return config.timeLimit;
  },

  canCoexist(existingFac, newFac) {
    // ★ 모든 시설은 독립 예약 — 서로 다른 시설은 항상 공존 가능
    // 동일 시설의 동일 세부(방/기기)만 중복 체크로 걸러짐 (reserveFacility에서 처리)
    return true;
  },
  getTimeSlots() {
    const slots = [];
    for (let h = 10; h < 20; h++) {
      if (h === 12) continue;
      slots.push(`${h}:00 ~ ${h+1}:00`);
    }
    return slots;
  },

  // ★ 댄스연습실/멀티룸 요일별 시간대
  // 일반 이용자: 화~금 10-20시, 토 10-18시, 일/월 불가
  // 관리자: 모든 요일 예약 가능 (일/월 포함, 10-20시 기본)
  getAdminTimeSlots(forceOpen) {
    const kst = Util.nowKST();
    const dayOfWeek = kst.getDay(); // 0=일, 1=월, 2=화, 3=수, 4=목, 5=금, 6=토

    if ((dayOfWeek === 0 || dayOfWeek === 1) && !forceOpen) {
      return { slots: [], closed: true, reason: '일요일/월요일은 예약이 불가능합니다.' };
    }

    // 일/월(관리자 강제 오픈) → 10-20시, 토 → 10-18시, 화~금 → 10-20시
    let endHour;
    if (dayOfWeek === 0 || dayOfWeek === 1) {
      endHour = 20; // 관리자 전용 — 일/월도 10-20시
    } else if (dayOfWeek === 6) {
      endHour = 18; // 토요일
    } else {
      endHour = 20; // 화~금
    }

    const slots = [];
    for (let h = 10; h < endHour; h++) {
      slots.push(`${h}:00 ~ ${h+1}:00`);
    }
    return { slots, closed: false, endHour };
  }
};

// ===== 관리자 계정 설정 =====
const AdminAuth = {
  // 관리자 아이디/비밀번호 (필요시 변경)
  ADMIN_ID: 'admin',
  ADMIN_PW: 'admin1388!',
  // 관리자 전용 가상 전화번호 (실적 카운트 제외용)
  ADMIN_PHONE: '00000000000',
  ADMIN_NAME: '관리자',

  _isLoggedIn: false,

  login(id, pw) {
    if (id === this.ADMIN_ID && pw === this.ADMIN_PW) {
      this._isLoggedIn = true;
      sessionStorage.setItem('admin_logged_in', 'true');
      return true;
    }
    return false;
  },

  logout() {
    this._isLoggedIn = false;
    sessionStorage.removeItem('admin_logged_in');
  },

  isLoggedIn() {
    if (this._isLoggedIn) return true;
    if (sessionStorage.getItem('admin_logged_in') === 'true') {
      this._isLoggedIn = true;
      return true;
    }
    return false;
  },

  isAdminPhone(phone) {
    return Util.cleanPhone(phone) === this.ADMIN_PHONE;
  }
};

// ===== Supabase REST API =====
const API = {
  _cache: {},
  _cacheTime: {},
  _CACHE_TTL: 5000, // ★ v7: 2000 → 5000ms (한 갱신 사이클 내 중복 조회 흡수)
  _MAX_RETRIES: 2,
  _RETRY_DELAY: 1000,

  // ★ v12d: 동적으로 현재 활성 DB의 헤더를 반환
  _headers(config) {
    const cfg = config || DBManager.getConfig();
    return {
      'Content-Type': 'application/json',
      'apikey': cfg.key,
      'Authorization': `Bearer ${cfg.key}`,
      'Prefer': 'return=representation'
    };
  },

  // ★ v12d: 특정 config로 URL 생성
  _buildUrl(path, config) {
    const cfg = config || DBManager.getConfig();
    return `${cfg.url}/rest/v1/${path}`;
  },

  // ★ 에러 상태코드별 사용자 친화적 메시지
  _friendlyError(status, table, method) {
    if (status === 401 || status === 403) return '서버 인증에 실패했습니다. API 키를 확인해주세요.';
    if (status === 402) return '서버 접근이 제한되었습니다 (402). Supabase 프로젝트 상태를 확인해주세요.';
    if (status === 404) return `테이블(${table})을 찾을 수 없습니다.`;
    if (status === 409) return '데이터 충돌이 발생했습니다. 잠시 후 다시 시도해주세요.';
    if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
    if (status >= 500) return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    return `서버 요청 실패 (${method} ${table}: ${status})`;
  },

  // ★ 페일오버 대상이 되는 에러인지 판별 (402, 5xx, 네트워크 에러)
  _isFailoverError(status) {
    if (!status) return true;  // 네트워크 에러 (status 없음)
    if (status === 402) return true;  // Supabase paused
    if (status >= 500) return true;   // 서버 에러
    return false;
  },

  // ★ v12d: 단일 DB 대상 재시도 (내부용) — 폴백 없이 순수 재시도만
  async _fetchSingleDB(url, options, table, method, maxRetries) {
    let lastErr;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        // 4xx 에러 중 폴백 대상이 아닌 건 바로 실패
        if (res.status >= 400 && res.status < 500 && !this._isFailoverError(res.status) && res.status !== 408 && res.status !== 429) {
          const errMsg = this._friendlyError(res.status, table, method);
          const err = new Error(errMsg);
          err.status = res.status;
          throw err;
        }
        lastErr = new Error(this._friendlyError(res.status, table, method));
        lastErr.status = res.status;
      } catch (e) {
        // 폴백 대상이 아닌 4xx는 즉시 throw
        if (e.status && e.status >= 400 && e.status < 500 && !this._isFailoverError(e.status) && e.status !== 408 && e.status !== 429) throw e;
        lastErr = e.message ? e : new Error('네트워크 연결에 실패했습니다. 인터넷 연결을 확인해주세요.');
        if (!lastErr.status) lastErr.status = 0; // 네트워크 에러 표시
      }
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, this._RETRY_DELAY * (attempt + 1)));
      }
    }
    throw lastErr;
  },

  // ★ v12d: 페일오버 포함 재시도 래퍼
  //  1) Primary 복구 체크 시점이면 Primary 먼저 시도
  //  2) 현재 활성 DB로 시도 (재시도 포함)
  //  3) 실패가 폴백 대상이면 → 상대 DB로 전환 + 재시도
  async _fetchWithRetry(urlPath, options, table, method) {
    // -- (A) 5분 경과 시 Primary 복구 탐색 --
    if (DBManager.shouldTryPrimaryRecovery()) {
      try {
        const pCfg = DBManager._primary;
        const pUrl = `${pCfg.url}/rest/v1/${urlPath}`;
        const pOpts = { ...options, headers: { ...this._headers(pCfg), ...(options.headers || {}) } };
        const res = await this._fetchSingleDB(pUrl, pOpts, table, method, 0); // 1회만
        DBManager.switchToPrimary();
        return res;
      } catch (_) {
        // Primary 여전히 실패 — failedAt 갱신하여 5분 타이머 리셋
        DBManager._failedAt = Date.now();
      }
    }

    // -- (B) 현재 활성 DB로 시도 --
    const currentCfg = DBManager.getConfig();
    const currentUrl = `${currentCfg.url}/rest/v1/${urlPath}`;
    const currentOpts = { ...options, headers: { ...this._headers(currentCfg), ...(options.headers || {}) } };

    try {
      return await this._fetchSingleDB(currentUrl, currentOpts, table, method, this._MAX_RETRIES);
    } catch (err) {
      // -- (C) 폴백 대상 에러 → 상대 DB 시도 --
      if (this._isFailoverError(err.status)) {
        const fbCfg = DBManager.getFallbackConfig();
        const fbUrl = `${fbCfg.url}/rest/v1/${urlPath}`;
        const fbOpts = { ...options, headers: { ...this._headers(fbCfg), ...(options.headers || {}) } };

        try {
          const res = await this._fetchSingleDB(fbUrl, fbOpts, table, method, 1); // 폴백은 1회 재시도
          // 폴백 성공 → DB 전환
          if (DBManager.isPrimary()) {
            DBManager.switchToSecondary();
          } else {
            DBManager.switchToPrimary();
          }
          return res;
        } catch (fbErr) {
          // 양쪽 모두 실패 — 원래 에러를 던짐 (두 DB 모두 다운)
          console.error(`[DBManager] ❌ 양쪽 DB 모두 실패 (${table} ${method})`);
          throw err;
        }
      }
      // 폴백 대상 아닌 에러(401/403/404/409 등)는 그대로 throw
      throw err;
    }
  },

  clearCache() {
    this._cache = {};
    this._cacheTime = {};
  },

  // ★ v12e: 듀얼 라이트 — 상대편 DB에 백그라운드 동기화 (실패해도 메인 흐름 차단 안 함)
  _syncToOtherDB(urlPath, options, label) {
    const otherCfg = DBManager.getFallbackConfig();
    const otherUrl = `${otherCfg.url}/rest/v1/${urlPath}`;
    const otherOpts = { ...options, headers: this._headers(otherCfg) };

    // 비동기로 fire-and-forget (메인 응답을 지연시키지 않음)
    fetch(otherUrl, otherOpts)
      .then(res => {
        if (!res.ok) {
          console.warn(`[DualWrite] ${label} → ${otherCfg.label} DB 동기화 실패 (HTTP ${res.status})`);
        }
      })
      .catch(err => {
        console.warn(`[DualWrite] ${label} → ${otherCfg.label} DB 동기화 네트워크 오류:`, err.message);
      });
  },

  async list(table, params = {}, useCache = false) {
    const cacheKey = `${table}_${JSON.stringify(params)}`;
    if (useCache && this._cache[cacheKey] && (Date.now() - this._cacheTime[cacheKey]) < this._CACHE_TTL) {
      return this._cache[cacheKey];
    }

    const PAGE_SIZE = 1000;
    let allData = [];
    let from = 0;

    while (true) {
      const qs = new URLSearchParams();
      qs.set('limit', PAGE_SIZE);
      qs.set('offset', from);
      for (const [k, v] of Object.entries(params)) {
        // ★ v7: 배열 값이면 같은 key를 여러 번 append (예: date range → date=gte.X&date=lt.Y)
        if (Array.isArray(v)) {
          v.forEach(val => qs.append(k, val));
        } else {
          qs.set(k, v);
        }
      }

      // ★ v12d: urlPath만 전달 — _fetchWithRetry 내부에서 활성 DB URL 합성
      const res = await this._fetchWithRetry(
        `${table}?${qs}`,
        { },
        table, 'GET'
      );
      const data = await res.json();
      const arr = Array.isArray(data) ? data : [];

      allData = [...allData, ...arr];

      if (arr.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    if (useCache) {
      this._cache[cacheKey] = allData;
      this._cacheTime[cacheKey] = Date.now();
    }
    return allData;
  },

  async get(table, id) {
    try {
      const res = await this._fetchWithRetry(
        `${table}?id=eq.${id}&limit=1`,
        { },
        table, 'GET'
      );
      const data = await res.json();
      return data[0] || null;
    } catch (e) {
      console.warn(`API.get(${table}, ${id}) 실패:`, e.message);
      return null;
    }
  },

  async create(table, data) {
    const bodyStr = JSON.stringify(data);
    const res = await this._fetchWithRetry(
      table,
      { method: 'POST', body: bodyStr },
      table, 'POST'
    );
    this.clearCache();
    const result = await res.json();
    const record = Array.isArray(result) ? result[0] : result;

    // ★ v12e 듀얼 라이트: 상대편 DB에도 동일 데이터 기록 (id 포함)
    if (record && record.id) {
      const syncData = { ...data, id: record.id };
      // created_at 등 시스템 필드도 복사
      if (record.created_at) syncData.created_at = record.created_at;
      this._syncToOtherDB(table, { method: 'POST', body: JSON.stringify(syncData) }, 'CREATE');
    }
    return record;
  },

  async update(table, id, data) {
    const bodyStr = JSON.stringify(data);
    const res = await this._fetchWithRetry(
      `${table}?id=eq.${id}`,
      { method: 'PATCH', body: bodyStr },
      table, 'PATCH'
    );
    this.clearCache();
    const result = await res.json();

    // ★ v12e 듀얼 라이트: 상대편 DB에도 동일 PATCH 적용
    this._syncToOtherDB(`${table}?id=eq.${id}`, { method: 'PATCH', body: bodyStr }, 'UPDATE');

    return Array.isArray(result) ? result[0] : result;
  },

  async remove(table, id) {
    await this._fetchWithRetry(
      `${table}?id=eq.${id}`,
      { method: 'DELETE' },
      table, 'DELETE'
    );
    this.clearCache();

    // ★ v12e 듀얼 라이트: 상대편 DB에도 동일 DELETE 적용
    this._syncToOtherDB(`${table}?id=eq.${id}`, { method: 'DELETE' }, 'DELETE');
  },

  // ★ v13: members 등 민감 테이블은 anon 직접 접근을 막고 Postgres 함수(RPC)로만 접근
  async rpc(fnName, params = {}) {
    const res = await this._fetchWithRetry(
      `rpc/${fnName}`,
      { method: 'POST', body: JSON.stringify(params) },
      fnName, 'POST'
    );
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  },

  // ★ v13.1: 결과가 1000건(Supabase/PostgREST 기본 최대 반환 행 수)을 넘을 수 있는
  // RPC는 함수 자체의 p_limit/p_offset 파라미터로 반복 호출해서 전체를 모아옴
  // (PostgREST가 RPC POST 호출에는 Range 헤더 페이지네이션을 적용하지 않기 때문)
  async rpcPaginated(fnName, params = {}) {
    const PAGE_SIZE = 1000;
    let all = [];
    let offset = 0;
    while (true) {
      const page = await this.rpc(fnName, { ...params, p_limit: PAGE_SIZE, p_offset: offset }) || [];
      all = all.concat(page);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
    return all;
  }
};

// ===== 비즈니스 로직 (Service) =====
const Service = {

  // ★ v12f: phones 배열이 클 때 50개씩 배치로 members 조회 (400 에러 방지)
  // ★ v13: members 테이블 직접 접근 대신 RPC(lookup_members_by_phones) 사용 — 전체 테이블 노출 차단
  async _batchGetMembers(phones) {
    if (!phones || phones.length === 0) return [];
    const BATCH = 50;
    let all = [];
    for (let i = 0; i < phones.length; i += BATCH) {
      const chunk = phones.slice(i, i + BATCH);
      const rows = await API.rpc('lookup_members_by_phones', { p_phones: chunk });
      all = all.concat(rows || []);
    }
    return all;
  },

  // ★ v13: RPC(lookup_member_by_phone) 사용 — anon은 전화번호 단건 조회만 가능
  async findMemberByPhone(phone) {
    const cleanP = Util.cleanPhone(phone);
    const members = await API.rpc('lookup_member_by_phone', { p_phone: cleanP });
    return (members && members[0]) || null;
  },

  async loginByNameAndPin(name, pin) {
    // ★ v13: RPC(lookup_members_by_name) 사용 → PIN(전화번호 뒷4자리)은 클라이언트에서 비교
    const members = await API.rpc('lookup_members_by_name', { p_name: name.trim() });
    const found = (members || []).filter(m => Util.phoneLast4(m.phone) === pin);
    return found.length === 0 ? null : found[0];
  },

  async processSearch(phone) {
    const cleanP = Util.cleanPhone(phone);

    // ★ 관리자 전용 번호 처리 — 실적 카운트 안 함
    if (AdminAuth.isAdminPhone(cleanP) && AdminAuth.isLoggedIn()) {
      const today = Util.todayStr();
      // ★ v7: 오늘 + 해당 전화번호 + 퇴장 안 한 건만 조회
      const logs = await API.list('access_logs', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
      const activeLog = logs[0] || null;
      if (!activeLog) {
        await API.create('access_logs', {
          date: today, entry_time: Util.timeStr(), exit_time: '',
          phone: cleanP, name: AdminAuth.ADMIN_NAME, note: '관리자',
          entry_timestamp: Date.now()
        });
        // ★ addDailyVisitor 호출 안 함 → 실적에 안 잡힘
      }
      return {
        status: 'success', name: AdminAuth.ADMIN_NAME, phone: cleanP,
        memberId: '__admin__', isAdmin: true,
        message: '관리자 모드로 입장합니다.'
      };
    }

    const member = await this.findMemberByPhone(cleanP);
    if (!member) return { status: 'unregistered', phone };

    const today = Util.todayStr();
    // ★ v7: 오늘 + 해당 전화번호 + 퇴장 안 한 건만 조회
    const logs = await API.list('access_logs', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
    const activeLog = logs[0] || null;

    if (activeLog) {
      return {
        status: 'success', name: member.name, phone: cleanP,
        memberId: member.id,
        message: `${member.name}님, 이미 입장 처리되어 있습니다.`
      };
    }

    await API.create('access_logs', {
      date: today, entry_time: Util.timeStr(), exit_time: '',
      phone: cleanP, name: member.name, note: '휴카페',
      entry_timestamp: Date.now()
    });
    await this.addDailyVisitor(cleanP, member.name, member.gender, Util.getAgeGroup(member.birthdate));

    return {
      status: 'success', name: member.name, phone: cleanP,
      memberId: member.id,
      message: `${member.name}님, 환영합니다!`
    };
  },

  async registerMember(data) {
    const { name, phone, birthdate, gender, regType, groupName, groupCount, groupDetail } = data;
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();
    const time = Util.timeStr();

    if (regType === '단체') {
      const displayName = `${groupName} (대표:${name})`;
      await API.create('access_logs', {
        date: today, entry_time: time, exit_time: '',
        phone: cleanP, name: displayName,
        note: `단체: ${groupCount}명`, entry_timestamp: Date.now()
      });
      await this.addDailyVisitor(cleanP, displayName, '단체', '단체', groupCount, groupDetail);
      return { status: 'success', name: displayName, phone: cleanP, message: '단체 입장 기록 완료!' };
    } else {
      // ★ v13: members INSERT도 RPC(register_member) 경유 (anon 직접 INSERT 권한 제거)
      const registered = await API.rpc('register_member', {
        p_phone: cleanP, p_name: name, p_birthdate: birthdate || null, p_gender: gender,
        p_reg_type: '개인', p_member_code: ''
      });
      const newMember = registered && registered[0];
      await API.create('access_logs', {
        date: today, entry_time: time, exit_time: '',
        phone: cleanP, name, note: '휴카페',
        entry_timestamp: Date.now()
      });
      await this.addDailyVisitor(cleanP, name, gender, '신규');
      return {
        status: 'success', name, phone: cleanP,
        memberId: newMember.id,
        message: '가입 및 입장 완료!'
      };
    }
  },

  async addDailyVisitor(phone, name, gender, ageGroup, groupCount = 0, note = '방문') {
    const cleanP = Util.cleanPhone(phone);
    // ★ 관리자 전화번호는 실적에 기록하지 않음
    if (AdminAuth.isAdminPhone(cleanP)) return;
    const today = Util.todayStr();
    // 단체는 같은 번호여도 별도 기록 (대표자 번호 하나로 여러 단체 가능)
    const isGroup = gender === '단체' || ageGroup === '단체';
    if (!isGroup) {
      // ★ v7: 오늘 + 해당 전화번호만 조회
      const exist = await API.list('daily_visitors', { date: `eq.${today}`, phone: `eq.${cleanP}` });
      if (exist.length > 0) return;
    }
    await API.create('daily_visitors', {
      date: today, phone: cleanP, name, gender,
      age_group: ageGroup, note, group_count: groupCount || 0
    });
  },

  async processExit(phone) {
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();
    const time = Util.timeStr();

    // ★ v7: 각 테이블을 오늘 + 해당 전화번호(+ 대기열은 활성 상태)로 필터링
    const logs = await API.list('access_logs', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
    for (const log of logs) {
      await API.update('access_logs', log.id, { exit_time: time });
    }
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
    for (const r of reserves) {
      await API.update('facility_reservations', r.id, { exit_time: time });
    }
    const waits = await API.list('waitlist', { date: `eq.${today}`, phone: `eq.${cleanP}`, status: 'in.(waiting,called)' });
    for (const w of waits) {
      await API.update('waitlist', w.id, { status: 'cancelled' });
    }
    return { status: 'success' };
  },

  async processMultiExit(phoneList) {
    let count = 0;
    for (const phone of phoneList) {
      await this.processExit(phone);
      count++;
    }
    return count;
  },

  async exitFacility(reservationId) {
    await API.update('facility_reservations', reservationId, { exit_time: Util.timeStr() });
    return { status: 'success' };
  },

  async _autoCloseExpiredTimeslot(r) {
    const config = FacilityConfig.facilities[r.facility];
    if (config && config.type === 'timeslot' && r.detail && r.detail !== '-') {
      const endHourMatch = r.detail.match(/~\s*(\d+):00/);
      if (endHourMatch) {
        const endHour = parseInt(endHourMatch[1]);
        if (Util.currentHour() >= endHour) {
          await API.update('facility_reservations', r.id, { exit_time: Util.timeStr() });
          return true;
        }
      }
    }
    return false;
  },

  async reserveFacility(phone, name, facility, detail, note) {
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();
    const time = Util.timeStr();
    const config = FacilityConfig.facilities[facility];
    const isAdmin = AdminAuth.isAdminPhone(cleanP);

    // ★ 관리자는 운영시간 제한 없음
    if (!Util.isOperatingHours() && !isAdmin) {
      return { status: 'error', message: '운영시간(10:00~20:00)이 아닙니다.\n운영시간 내에 예약해주세요.' };
    }

    // ★ 관리자 전용 시설(adminOnly)은 관리자만 예약 가능
    if (config && config.adminOnly && !isAdmin) {
      return { status: 'error', message: `${facility}은(는) 관리자만 예약할 수 있습니다.` };
    }

    // ★ 12:00~13:00 점심시간 예약 차단 (댄스연습실/멀티룸)
    if (config && config.type === 'timeslot' && detail) {
      const detailHour = parseInt(detail.split(':')[0]);
      if (detailHour === 12) {
        return { status: 'error', message: '12:00~13:00은 점심시간으로 예약할 수 없습니다.' };
      }
    }

    if (config && config.type === 'timeslot' && detail) {
      const slotHour = parseInt(detail.split(':')[0]);
      // ★ 관리자는 지난 시간대도 예약 가능
      if (!isNaN(slotHour) && slotHour < Util.currentHour() && !isAdmin) {
        return { status: 'error', message: '이미 지난 시간대는 예약할 수 없습니다.' };
      }
    }

    // ★ v7: 오늘 + 해당 전화번호 + 아직 이용중(exit_time 빈값)인 예약만 조회
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
    const myActive = [];
    for (const r of reserves) {
      if (await this._autoCloseExpiredTimeslot(r)) continue;
      myActive.push(r);
    }

    // ★ 중복 예약 체크 — 모임방은 1개만, 나머지는 동일 세부(방/기기)만 차단
    // ★ 관리자의 timeslot 시설(댄스연습실/멀티룸)은 여러 시간대 예약 가능 → 동일 시간대만 차단
    if (facility === '모임방') {
      const dupRoom = myActive.find(r => r.facility === '모임방');
      if (dupRoom) {
        return { status: 'error', message: `이미 모임방(${dupRoom.detail})을 이용 중입니다. 모임방은 1개만 예약 가능합니다.` };
      }
    } else if (isAdmin && config && config.type === 'timeslot') {
      // 관리자 timeslot: 동일 시설+동일 시간대만 중복 차단
      const dup = myActive.find(r => r.facility === facility && r.detail === (detail || '-'));
      if (dup) {
        return { status: 'error', message: `이미 ${facility} ${detail || ''}이(가) 예약되어 있습니다.` };
      }
    } else {
      const dup = myActive.find(r => r.facility === facility && r.detail === (detail || '-'));
      if (dup) {
        return { status: 'error', message: `이미 ${facility} ${detail || ''}을(를) 이용 중입니다.` };
      }
    }

    // ★ v12e: 요일별 동적 시간제한 (토요일 노래방 20분)
    const timeLimit = FacilityConfig.getTimeLimit(facility);
    const createData = {
      date: today, entry_time: time, exit_time: '',
      phone: cleanP, name, facility, detail: detail || '-',
      time_limit: timeLimit, extended_count: 0
    };
    // ★ note 필드가 있으면 추가 (DB 컬럼 미존재 시 안전 폴백)
    if (note) createData.note = note;

    try {
      await API.create('facility_reservations', createData);
    } catch (createErr) {
      // note 필드로 인한 에러일 수 있음 → note 없이 재시도
      console.warn('facility_reservations 생성 실패, note 제외 재시도:', createErr.message);
      delete createData.note;
      try {
        const created = await API.create('facility_reservations', createData);
        // note가 있었다면 별도 업데이트 시도
        if (note && created && created.id) {
          try { await API.update('facility_reservations', created.id, { note: note }); } catch(e) { /* note 업데이트 실패 무시 */ }
        }
      } catch (retryErr) {
        console.error('facility_reservations 생성 최종 실패:', retryErr.message);
        return { status: 'error', message: '예약 데이터 저장에 실패했습니다. 관리자에게 문의하세요.' };
      }
    }

    // ★ v7: 오늘 + 해당 시설 + 해당 전화번호 + 활성 대기열만 조회
    const waits = await API.list('waitlist', { date: `eq.${today}`, facility: `eq.${facility}`, phone: `eq.${cleanP}`, status: 'in.(waiting,called)' });
    for (const w of waits) {
      await API.update('waitlist', w.id, { status: 'completed' });
    }

    return { status: 'success', message: `${facility} ${detail || ''} 예약 완료!` };
  },

  async extendTime(reservationId, addMinutes = 30) {
    const r = await API.get('facility_reservations', reservationId);
    if (!r) return { status: 'error', message: '예약을 찾을 수 없습니다.' };
    const currentLimit = parseInt(r.time_limit, 10) || 30;
    const mins = parseInt(addMinutes, 10) || 10;
    const newLimit = currentLimit + mins;
    const extCount = (parseInt(r.extended_count, 10) || 0) + 1;
    await API.update('facility_reservations', reservationId, {
      time_limit: newLimit, extended_count: extCount
    });
    return { status: 'success', message: `${mins}분 연장 완료! (총 ${newLimit}분)` };
  },

  async getOccupiedFacilities() {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 아직 이용중인 예약만 조회
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, exit_time: 'eq.' });
    const result = [];
    for (const r of reserves) {
      if (await this._autoCloseExpiredTimeslot(r)) continue;
      const label = r.detail && r.detail !== '-' ? `${r.facility} ${r.detail}` : r.facility;
      result.push(label);
    }
    return result;
  },

  async getUserActiveReservations(phone) {
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();
    // ★ v7: 오늘 + 해당 전화번호 + 아직 이용중인 예약만 조회
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, phone: `eq.${cleanP}`, exit_time: 'eq.' });
    const active = [];
    for (const r of reserves) {
      if (await this._autoCloseExpiredTimeslot(r)) continue;
      active.push(r);
    }
    return active;
  },

  async getUserVisitCount(phone) {
    const cleanP = Util.cleanPhone(phone);
    const month = Util.thisMonth();
    const [start, end] = Util.monthRange(month);
    // ★ v7: 이번 달 + 해당 전화번호만 조회
    const logs = await API.list('access_logs', { date: [`gte.${start}`, `lt.${end}`], phone: `eq.${cleanP}` });
    const days = new Set();
    logs.forEach(l => { if (l.date) days.add(l.date); });
    return days.size;
  },

  async joinWaitlist(phone, name, facility, detail) {
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();

    // ★ 관리자는 운영시간 제한 없음
    if (!Util.isOperatingHours() && !AdminAuth.isAdminPhone(cleanP)) {
      return { status: 'error', message: '운영시간(10:00~20:00)이 아닙니다.' };
    }

    // ★ v7: 오늘 + 해당 전화번호 + 해당 시설 + 이용중인 예약만 조회
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, phone: `eq.${cleanP}`, facility: `eq.${facility}`, exit_time: 'eq.' });
    const activeForFacility = reserves.find(r => (detail ? r.detail === (detail || '-') : true));
    if (activeForFacility) {
      return { status: 'error', message: `현재 ${facility}을(를) 이용 중입니다. 이용 종료 후 대기 등록이 가능합니다.` };
    }

    // ★ v7: 오늘 + 해당 시설 + 활성 대기열만 조회 (내 중복 체크 + 전체 순번 계산에 함께 사용)
    const facilityWaitsAll = await API.list('waitlist', { date: `eq.${today}`, facility: `eq.${facility}`, status: 'in.(waiting,called)' });
    const existing = facilityWaitsAll.find(w =>
      (detail ? w.detail === detail : true) && Util.cleanPhone(w.phone) === cleanP
    );
    if (existing) {
      return { status: 'error', message: '이미 해당 시설에 대기 중입니다.' };
    }

    const facilityWaits = facilityWaitsAll.filter(w => (detail ? w.detail === detail : true));
    const queueNumber = facilityWaits.length + 1;

    await API.create('waitlist', {
      date: today, facility, detail: detail || '-',
      phone: cleanP, name,
      queue_number: queueNumber,
      status: 'waiting',
      created_at: Date.now(),
      called_at: 0
    });

    return {
      status: 'success',
      queueNumber,
      message: `${facility} ${detail || ''} 대기 ${queueNumber}번째 등록!`
    };
  },

  // ★ v12f: 대기 예상 시간 계산
  // 현재 이용자의 남은 시간 + 앞 대기자들의 이용시간을 합산하여 예상 대기시간 반환
  async getWaitEstimate(facility, detail) {
    const today = Util.todayStr();
    const time = Util.timeStr();

    // 1) 현재 해당 세부공간(방/기기)의 이용 중인 예약 조회
    const reserves = await API.list('facility_reservations', {
      date: `eq.${today}`, facility: `eq.${facility}`, exit_time: 'eq.'
    }, true);
    const activeForSlot = reserves.filter(r => detail ? r.detail === detail : true);

    // 2) 현재 이용자의 남은 시간 계산 (가장 빨리 끝나는 이용자 기준)
    let minRemain = 0;
    if (activeForSlot.length > 0) {
      const remains = activeForSlot.map(r => {
        const tLimit = parseInt(r.time_limit, 10) || 0;
        if (tLimit <= 0) return 0; // 시간제한 없는 시설
        const elapsed = Util.getElapsedMinutes(r.entry_time);
        return Math.max(tLimit - elapsed, 0);
      }).filter(r => r > 0);
      minRemain = remains.length > 0 ? Math.min(...remains) : 0;
    }

    // 3) 앞 대기자 수 확인
    const waits = await API.list('waitlist', {
      date: `eq.${today}`, facility: `eq.${facility}`, status: 'in.(waiting,called)'
    }, true);
    const aheadWaits = waits.filter(w => detail ? w.detail === detail : true);
    const aheadCount = aheadWaits.length;

    // 4) 예상 대기시간 = 현재 이용자 남은시간 + (앞 대기자 수 × 시설별 기본 이용시간)
    const baseTime = FacilityConfig.getTimeLimit(facility);
    const estimateMin = minRemain + (aheadCount * baseTime);

    return {
      aheadCount,        // 앞에 대기 중인 사람 수
      currentRemain: minRemain,  // 현재 이용자의 최소 남은시간
      baseTime,          // 1회 기본 이용시간
      estimateMin,       // 총 예상 대기시간 (분)
      hasActiveUser: activeForSlot.length > 0
    };
  },

  async getWaitlist(facility, detail) {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 해당 시설 + 활성 대기열만 조회
    const waits = await API.list('waitlist', { date: `eq.${today}`, facility: `eq.${facility}`, status: 'in.(waiting,called)' });
    return waits
      .filter(w => (detail ? w.detail === detail : true))
      .sort((a, b) => (a.queue_number || 0) - (b.queue_number || 0));
  },

  async getAllWaitlists() {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 활성 대기열만 조회
    const active = (await API.list('waitlist', { date: `eq.${today}`, status: 'in.(waiting,called)' }))
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    const grouped = {};
    for (const w of active) {
      const key = w.detail && w.detail !== '-' ? `${w.facility} ${w.detail}` : w.facility;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(w);
    }
    return grouped;
  },

  async getWaitlistCounts() {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 활성 대기열만, 짧은 캐시 사용
    const waits = await API.list('waitlist', { date: `eq.${today}`, status: 'in.(waiting,called)' }, true);
    const counts = {};
    for (const w of waits) {
      const key = w.detail && w.detail !== '-' ? `${w.facility} ${w.detail}` : w.facility;
      counts[key] = (counts[key] || 0) + 1;
      const facKey = `__fac__${w.facility}`;
      counts[facKey] = (counts[facKey] || 0) + 1;
    }
    return counts;
  },

  async callWaitlistEntry(waitId) {
    await API.update('waitlist', waitId, { status: 'called', called_at: Date.now() });
    return { status: 'success' };
  },

  async confirmWaitlistEntry(waitId) {
    const w = await API.get('waitlist', waitId);
    if (!w || w.status !== 'called') {
      return { status: 'error', message: '호출된 대기가 아닙니다.' };
    }
    const result = await this.reserveFacility(w.phone, w.name, w.facility, w.detail === '-' ? '' : w.detail);
    if (result.status === 'success') {
      return { status: 'success', message: `${w.facility} ${w.detail !== '-' ? w.detail : ''} 이용이 시작되었습니다!` };
    }
    return result;
  },

  async cancelWaitlist(waitId) {
    await API.update('waitlist', waitId, { status: 'cancelled' });
    return { status: 'success' };
  },

  async getMyWaitlist(phone) {
    const cleanP = Util.cleanPhone(phone);
    const today = Util.todayStr();
    // ★ v7: 오늘 + 해당 전화번호 + 활성 대기열만 조회
    return await API.list('waitlist', { date: `eq.${today}`, phone: `eq.${cleanP}`, status: 'in.(waiting,called)' });
  },

  async getActiveUsers() {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 아직 퇴장 안 한 이용자/예약만 조회 (관리자 화면 30초 폴링의 핵심 최적화 지점)
    const logs = await API.list('access_logs', { date: `eq.${today}`, exit_time: 'eq.' });
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, exit_time: 'eq.' }, true);

    for (const r of reserves) {
      if (await this._autoCloseExpiredTimeslot(r)) r.exit_time = Util.timeStr();
    }

    const activeLogs = logs.filter(l => isExitEmpty(l.exit_time));
    activeLogs.sort((a, b) => (b.entry_timestamp || 0) - (a.entry_timestamp || 0));

    // ★ v7: 회원 전체 대신, 오늘 활성 로그에 등장하는 전화번호만 phone=in.() 으로 조회
    const activePhones = [...new Set(activeLogs.map(l => Util.cleanPhone(l.phone)))];
    const members = activePhones.length > 0
      ? await this._batchGetMembers(activePhones)
      : [];
    const memberMap = {};
    members.forEach(m => { memberMap[Util.cleanPhone(m.phone)] = m; });

    const processed = new Set();
    const users = [];

    for (const log of activeLogs) {
      const cleanP = Util.cleanPhone(log.phone);
      const rawName = log.name || '';
      const note = log.note || '';
      const isGroup = rawName.includes('단체') || rawName.includes('대표:') || note.includes('단체');

      // 단체는 같은 번호여도 각각 별도 표시 (logId로 구분)
      // 개인은 같은 번호면 중복 방지
      if (!isGroup) {
        if (processed.has(cleanP)) continue;
        processed.add(cleanP);
      }

      const myReserves = reserves.filter(
        r => r.date === today && isExitEmpty(r.exit_time) && Util.cleanPhone(r.phone) === cleanP
      );

      let displayName = rawName;
      let groupCount = '';
      let ageGroup = '일반';

      if (isGroup) {
        const m = note.match(/\d+명/);
        groupCount = m ? m[0] : '';
        displayName = `👥 ${rawName}`;
        ageGroup = '단체';
      } else {
        const mem = memberMap[cleanP];
        if (mem && mem.birthdate) ageGroup = Util.getAgeGroup(mem.birthdate);
      }

      users.push({
        logId: log.id, name: displayName,
        phone: Util.formatPhone(cleanP), rawPhone: cleanP,
        entryTime: (log.entry_time || '').substring(0, 5),
        reservations: myReserves,
        facility: myReserves.length > 0
          ? myReserves.map(r => r.detail && r.detail !== '-' ? `${r.facility} ${r.detail}` : r.facility).join(', ')
          : '휴카페',
        ageGroup, groupCount, isGroup
      });
    }
    return users;
  },

  async processAllExit() {
    const today = Util.todayStr();
    const time = Util.timeStr();
    // ★ v7: 오늘 + 아직 활성 상태인 건만 조회
    const logs = await API.list('access_logs', { date: `eq.${today}`, exit_time: 'eq.' });
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, exit_time: 'eq.' });
    const waits = await API.list('waitlist', { date: `eq.${today}`, status: 'in.(waiting,called)' });
    let count = 0;
    for (const l of logs) { await API.update('access_logs', l.id, { exit_time: time }); count++; }
    for (const r of reserves) { await API.update('facility_reservations', r.id, { exit_time: time }); }
    for (const w of waits) { await API.update('waitlist', w.id, { status: 'cancelled' }); }
    return count;
  },

  async getMonthlyStats(targetMonth) {
    const [start, end] = Util.monthRange(targetMonth);
    // ★ v7: 해당 월만 조회
    const daily = await API.list('daily_visitors', { date: [`gte.${start}`, `lt.${end}`] });
    const stats = {
      total: 0, m_ele: 0, f_ele: 0, m_mid: 0, f_mid: 0,
      m_high: 0, f_high: 0, m_youth: 0, f_youth: 0, m_adult: 0, f_adult: 0,
      group_total: 0, visit_days: 0
    };
    // ★ v7: 회원 전체 대신, 이번 달 방문 기록에 등장하는 전화번호만 조회
    const phones = [...new Set(daily.map(row => Util.cleanPhone(row.phone)).filter(Boolean))];
    const members = await this._batchGetMembers(phones);
    const memberMap = {};
    members.forEach(m => { memberMap[Util.cleanPhone(m.phone)] = m; });
    const dateSet = new Set();

    for (const row of daily) {
      if (!row.date) continue;
      dateSet.add(row.date);
      const name = row.name || '';
      const cleanP = Util.cleanPhone(row.phone);

      if (row.gender === '단체' || name.includes('단체') || name.includes('대표:')) {
        const gc = parseInt(row.group_count) || 0;
        stats.group_total += gc; stats.total += gc; continue;
      }

      const mem = memberMap[cleanP];
      const gender = mem ? mem.gender : row.gender;
      const birth = mem ? mem.birthdate : null;
      const ageGroup = birth ? Util.getAgeGroup(birth) : '성인';
      const g = gender === '남' ? 'm' : (gender === '여' ? 'f' : null);
      if (!g) continue;
      const ageKey = { '초등': 'ele', '중등': 'mid', '고등': 'high', '후기청소년': 'youth', '성인': 'adult' }[ageGroup] || 'adult';
      const key = `${g}_${ageKey}`;
      if (stats[key] !== undefined) { stats[key]++; stats.total++; }
    }
    stats.visit_days = dateSet.size;
    return stats;
  },

  async getOverdueReservations() {
    const today = Util.todayStr();
    // ★ v7: 오늘 + 이용중 + 시간제한 있는 예약만 조회
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, exit_time: 'eq.', time_limit: 'gt.0' }, true);
    const overdue = [];
    for (const r of reserves) {
      const elapsed = Util.getElapsedMinutes(r.entry_time);
      if (elapsed >= r.time_limit) {
        overdue.push({ ...r, elapsed, overMinutes: elapsed - r.time_limit });
      }
    }
    return overdue;
  },

  // ===== 회원 관리 =====
  // ★ v13: members 전체 조회/수정/삭제는 비밀번호를 서버(Postgres 함수)에서 검증하는
  // RPC로만 가능 — anon 키만으로는 더 이상 전체 회원목록을 가져올 수 없음
  async getAllMembers(password) {
    return await API.rpcPaginated('admin_list_members', { p_password: password });
  },

  async updateMember(memberId, data, password) {
    await API.rpc('admin_update_member', {
      p_password: password, p_id: Number(memberId),
      p_name: data.name, p_phone: data.phone,
      p_birthdate: data.birthdate || null, p_gender: data.gender || null
    });
    return { status: 'success', message: '회원 정보가 수정되었습니다.' };
  },

  async deleteMember(memberId, password) {
    await API.rpc('admin_delete_member', { p_password: password, p_id: Number(memberId) });
    return { status: 'success', message: '회원이 삭제되었습니다.' };
  },

  async searchMembers(query, password) {
    const members = await API.rpcPaginated('admin_list_members', { p_password: password });
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      Util.cleanPhone(m.phone).includes(q.replace(/[^0-9]/g, ''))
    );
  },

  // ===== 일별 통계 조회 =====
  async getDailyBreakdown(targetMonth) {
    const [start, end] = Util.monthRange(targetMonth);
    // ★ v7: 해당 월만 조회
    const daily = await API.list('daily_visitors', { date: [`gte.${start}`, `lt.${end}`] });
    const phones = [...new Set(daily.map(row => Util.cleanPhone(row.phone)).filter(Boolean))];
    const members = await this._batchGetMembers(phones);
    const memberMap = {};
    members.forEach(m => { memberMap[Util.cleanPhone(m.phone)] = m; });

    const dayMap = {};
    for (const row of daily) {
      if (!row.date) continue;
      if (!dayMap[row.date]) {
        dayMap[row.date] = { date: row.date, total: 0, m_ele: 0, f_ele: 0, m_mid: 0, f_mid: 0, m_high: 0, f_high: 0, m_youth: 0, f_youth: 0, m_adult: 0, f_adult: 0, group_total: 0 };
      }
      const d = dayMap[row.date];
      const name = row.name || '';
      const cleanP = Util.cleanPhone(row.phone);

      if (row.gender === '단체' || name.includes('단체') || name.includes('대표:')) {
        const gc = parseInt(row.group_count) || 0;
        d.group_total += gc; d.total += gc; continue;
      }

      const mem = memberMap[cleanP];
      const gender = mem ? mem.gender : row.gender;
      const birth = mem ? mem.birthdate : null;
      const ageGroup = birth ? Util.getAgeGroup(birth) : '성인';
      const g = gender === '남' ? 'm' : (gender === '여' ? 'f' : null);
      if (!g) continue;
      const ageKey = { '초등': 'ele', '중등': 'mid', '고등': 'high', '후기청소년': 'youth', '성인': 'adult' }[ageGroup] || 'adult';
      const key = `${g}_${ageKey}`;
      if (d[key] !== undefined) { d[key]++; d.total++; }
    }

    return Object.values(dayMap).sort((a, b) => a.date.localeCompare(b.date));
  },

  // ===== 년도별 목표치 관리 (Supabase DB + localStorage 폴백) =====
  _settingsCache: {},
  _settingsCacheTime: {},

  async _getSetting(key) {
    // 캐시 확인 (10초 TTL)
    if (this._settingsCache[key] && (Date.now() - (this._settingsCacheTime[key] || 0)) < 10000) {
      return this._settingsCache[key];
    }
    try {
      const rows = await this._tableList('yearly_settings', { search: key });
      const match = rows.find(r => r.setting_key === key);
      if (match && match.setting_value) {
        const val = typeof match.setting_value === 'string' ? match.setting_value : JSON.stringify(match.setting_value);
        this._settingsCache[key] = val;
        this._settingsCacheTime[key] = Date.now();
        return val;
      }
    } catch (e) {
      console.warn('DB 설정 조회 실패, localStorage 폴백:', key);
    }
    return null;
  },

  async _setSetting(key, value) {
    const valStr = typeof value === 'string' ? value : JSON.stringify(value);
    try {
      const rows = await this._tableList('yearly_settings', { search: key });
      const existing = rows.find(r => r.setting_key === key);
      if (existing) {
        await this._tableUpdate('yearly_settings', existing.id, { setting_value: valStr, updated_at: Date.now() });
      } else {
        await this._tableCreate('yearly_settings', { setting_key: key, setting_value: valStr, updated_at: Date.now() });
      }
      this._settingsCache[key] = valStr;
      this._settingsCacheTime[key] = Date.now();
    } catch (e) {
      console.error('DB 설정 저장 실패:', key, e);
    }
  },

  async getYearlyGoal(year) {
    try {
      const val = await this._getSetting(`yearly_goal_${year}`);
      if (val) return parseInt(val, 10) || 0;
      // localStorage 폴백
      const goals = JSON.parse(localStorage.getItem('cafe_yearly_goals') || '{}');
      return parseInt(goals[year], 10) || 0;
    } catch { return 0; }
  },

  async setYearlyGoal(year, target) {
    const val = parseInt(target, 10) || 0;
    await this._setSetting(`yearly_goal_${year}`, String(val));
    // localStorage 백업
    try {
      const goals = JSON.parse(localStorage.getItem('cafe_yearly_goals') || '{}');
      goals[year] = val;
      localStorage.setItem('cafe_yearly_goals', JSON.stringify(goals));
    } catch (e) { }
  },

  // ===== 년도 누적 실적 조회 =====
  async getYearlyTotal(year) {
    const [start, end] = Util.yearRange(year);
    // ★ v7: 해당 연도만 조회
    const daily = await API.list('daily_visitors', { date: [`gte.${start}`, `lt.${end}`] });
    const phones = [...new Set(daily.map(row => Util.cleanPhone(row.phone)).filter(Boolean))];
    const members = await this._batchGetMembers(phones);
    const memberMap = {};
    members.forEach(m => { memberMap[Util.cleanPhone(m.phone)] = m; });

    let total = 0;
    const monthTotals = {};

    for (const row of daily) {
      if (!row.date) continue;
      const month = row.date.slice(0, 7);
      if (!monthTotals[month]) monthTotals[month] = 0;

      const name = row.name || '';
      if (row.gender === '단체' || name.includes('단체') || name.includes('대표:')) {
        const gc = parseInt(row.group_count) || 0;
        total += gc;
        monthTotals[month] += gc;
        continue;
      }

      const cleanP = Util.cleanPhone(row.phone);
      const mem = memberMap[cleanP];
      const gender = mem ? mem.gender : row.gender;
      if (gender === '남' || gender === '여') {
        total++;
        monthTotals[month]++;
      }
    }

    // ★ 보정값(stats_adjustments) 반영 — 월간 통계와 동일하게 연간 실적에도 적용
    try {
      for (let m = 1; m <= 12; m++) {
        const monthKey = `${year}-${String(m).padStart(2, '0')}`;
        const adjMap = await this.getMonthlyAdjs(monthKey);
        let monthAdj = 0;
        for (const [dateStr, adj] of Object.entries(adjMap)) {
          const fields = ['m_ele','f_ele','m_mid','f_mid','m_high','f_high','m_youth','f_youth','m_adult','f_adult','group_total'];
          for (const f of fields) {
            const av = parseInt(adj[f], 10) || 0;
            monthAdj += av;
          }
        }
        if (monthAdj !== 0) {
          if (!monthTotals[monthKey]) monthTotals[monthKey] = 0;
          monthTotals[monthKey] = Math.max(0, monthTotals[monthKey] + monthAdj);
          total += monthAdj;
        }
      }
      total = Math.max(0, total);
    } catch (e) {
      console.warn('연간 보정값 반영 실패:', e);
    }

    return { total, monthTotals };
  },

  // ===== 작년 실적 관리 (Supabase DB + localStorage 폴백) =====
  async getPrevYearMonthly(year) {
    try {
      const val = await this._getSetting(`prev_year_monthly_${year}`);
      if (val) return JSON.parse(val);
      return JSON.parse(localStorage.getItem(`cafe_prev_year_monthly_${year}`) || '{}');
    } catch { return {}; }
  },

  async setPrevYearMonth(year, month, data) {
    try {
      const all = await this.getPrevYearMonthly(year);
      all[month] = data;
      const allStr = JSON.stringify(all);
      await this._setSetting(`prev_year_monthly_${year}`, allStr);
      localStorage.setItem(`cafe_prev_year_monthly_${year}`, allStr);
    } catch (e) { console.error('작년 실적 저장 실패:', e); }
  },

  async getPrevYearTotal(year) {
    const monthly = await this.getPrevYearMonthly(year);
    let total = 0;
    const monthTotals = {};
    for (const [mm, d] of Object.entries(monthly)) {
      const v = parseInt(d.total, 10) || 0;
      total += v;
      monthTotals[`${year}-${mm}`] = v;
    }
    return { total, monthTotals };
  },

  // ===== 통계 보정값 관리 (Supabase DB) =====
  _adjCache: {},
  _adjCacheLoaded: {},

  // 통계 캐시 전체 초기화 (다른 사람의 수정사항을 반영하기 위해)
  clearStatsCache() {
    this._adjCache = {};
    this._adjCacheLoaded = {};
    this._settingsCache = {};
    this._settingsCacheTime = {};
    API.clearCache();
  },

  async _tableList(table, params = {}) {
    const supaParams = {};
    if (params.search) {
      supaParams['date'] = `like.${params.search}*`;
    }
    return await API.list(table, supaParams);
  },

  async _tableCreate(table, data) {
    return await API.create(table, data);
  },

  async _tableUpdate(table, id, data) {
    return await API.update(table, id, data);
  },

  async _tableDelete(table, id) {
    return await API.remove(table, id);
  },

  async getStatsAdj(date) {
    if (this._adjCache[date] && (Date.now() - (this._adjCacheLoaded[date] || 0)) < 5000) {
      return this._adjCache[date];
    }
    try {
      const rows = await this._tableList('stats_adjustments', { search: date, limit: 100 });
      const match = rows.find(r => r.date === date);
      if (match && match.adj_data) {
        const adj = typeof match.adj_data === 'string' ? JSON.parse(match.adj_data) : match.adj_data;
        this._adjCache[date] = adj;
        this._adjCacheLoaded[date] = Date.now();
        return adj;
      }
    } catch (e) {
      console.error('보정값 조회 실패:', e);
      try { return JSON.parse(localStorage.getItem(`cafe_stats_adj_${date}`) || '{}'); } catch { }
    }
    this._adjCache[date] = {};
    this._adjCacheLoaded[date] = Date.now();
    return {};
  },

  async setStatsAdj(date, adj, memo) {
    memo = memo || '';
    const adjStr = JSON.stringify(adj);
    try {
      const rows = await this._tableList('stats_adjustments', { search: date, limit: 100 });
      const existing = rows.find(r => r.date === date);
      const prevData = existing && existing.adj_data
        ? (typeof existing.adj_data === 'string' ? existing.adj_data : JSON.stringify(existing.adj_data))
        : '{}';

      if (existing) {
        await this._tableUpdate('stats_adjustments', existing.id, { adj_data: adjStr, updated_at: Date.now() });
      } else {
        await this._tableCreate('stats_adjustments', { date: date, adj_data: adjStr, updated_at: Date.now() });
      }

      try {
        await this._tableCreate('adj_history', {
          date: date,
          action: Object.keys(adj).length > 0 ? 'update' : 'clear',
          adj_data: adjStr, prev_data: prevData, memo: memo, created_at: Date.now()
        });
      } catch (histErr) {
        console.warn('히스토리 기록 실패 (보정값 저장은 성공):', histErr);
      }

      this._adjCache[date] = adj;
      this._adjCacheLoaded[date] = Date.now();
      localStorage.setItem(`cafe_stats_adj_${date}`, adjStr);
      console.log('보정값 저장 성공:', date, adj);
    } catch (e) {
      console.error('보정값 DB 저장 실패, localStorage 폴백:', e);
      localStorage.setItem(`cafe_stats_adj_${date}`, adjStr);
      this._adjCache[date] = adj;
      this._adjCacheLoaded[date] = Date.now();
    }
  },

  async clearStatsAdj(date, memo) {
    memo = memo || '보정 초기화';
    try {
      const rows = await this._tableList('stats_adjustments', { search: date, limit: 100 });
      const existing = rows.find(r => r.date === date);
      const prevData = existing && existing.adj_data
        ? (typeof existing.adj_data === 'string' ? existing.adj_data : JSON.stringify(existing.adj_data))
        : '{}';
      if (existing) {
        await this._tableDelete('stats_adjustments', existing.id);
      }
      try {
        await this._tableCreate('adj_history', {
          date: date, action: 'clear', adj_data: '{}',
          prev_data: prevData, memo: memo, created_at: Date.now()
        });
      } catch (histErr) {
        console.warn('히스토리 기록 실패:', histErr);
      }
      delete this._adjCache[date];
      delete this._adjCacheLoaded[date];
      localStorage.removeItem(`cafe_stats_adj_${date}`);
      console.log('보정값 초기화 성공:', date);
    } catch (e) {
      console.error('보정값 삭제 실패:', e);
      localStorage.removeItem(`cafe_stats_adj_${date}`);
      delete this._adjCache[date];
    }
  },

  async getMonthlyAdjs(targetMonth) {
    try {
      const rows = await this._tableList('stats_adjustments', { search: targetMonth, limit: 500 });
      const map = {};
      for (const row of rows) {
        if (row.date && row.date.startsWith(targetMonth) && row.adj_data) {
          map[row.date] = typeof row.adj_data === 'string' ? JSON.parse(row.adj_data) : row.adj_data;
        }
      }
      return map;
    } catch (e) {
      console.error('월별 보정값 조회 실패 (localStorage 폴백):', e);
      const map = {};
      try {
        const year = parseInt(targetMonth.slice(0,4));
        const month = parseInt(targetMonth.slice(5,7));
        const daysInMonth = new Date(year, month, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${targetMonth}-${String(d).padStart(2,'0')}`;
          const stored = localStorage.getItem(`cafe_stats_adj_${dateStr}`);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (Object.keys(parsed).length > 0) map[dateStr] = parsed;
          }
        }
      } catch (e2) { console.error('localStorage 폴백도 실패:', e2); }
      return map;
    }
  },

  async getAdjHistory(targetMonth) {
    try {
      const rows = await this._tableList('adj_history', { search: targetMonth, limit: 500, sort: 'created_at' });
      const filtered = rows.filter(r => r.date && r.date.startsWith(targetMonth));
      filtered.sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
      return filtered;
    } catch (e) {
      console.error('보정 히스토리 조회 실패:', e);
      return [];
    }
  },

  async getDailyBreakdownWithAdj(targetMonth) {
    const rows = await this.getDailyBreakdown(targetMonth);
    const fields = ['m_ele','f_ele','m_mid','f_mid','m_high','f_high','m_youth','f_youth','m_adult','f_adult','group_total'];
    const adjMap = await this.getMonthlyAdjs(targetMonth);

    // 기존 데이터에 보정값 적용
    const existingDates = new Set(rows.map(r => r.date));
    for (const row of rows) {
      const adj = adjMap[row.date] || {};
      if (Object.keys(adj).length === 0) continue;
      row._hasAdj = true;
      let adjTotal = 0;
      for (const f of fields) {
        const av = parseInt(adj[f], 10) || 0;
        if (av !== 0) {
          row[f] = Math.max(0, (row[f] || 0) + av);
          adjTotal += av;
        }
      }
      row.total = Math.max(0, (row.total || 0) + adjTotal);
    }

    // ★ 보정값만 있고 daily_visitors에 없는 날짜 → 새 행 생성 (수동 입력 지원)
    for (const [dateStr, adj] of Object.entries(adjMap)) {
      if (existingDates.has(dateStr)) continue;
      if (!dateStr.startsWith(targetMonth)) continue;
      const newRow = { date: dateStr, total: 0, m_ele: 0, f_ele: 0, m_mid: 0, f_mid: 0, m_high: 0, f_high: 0, m_youth: 0, f_youth: 0, m_adult: 0, f_adult: 0, group_total: 0, _hasAdj: true };
      let adjTotal = 0;
      for (const f of fields) {
        const av = parseInt(adj[f], 10) || 0;
        if (av !== 0) { newRow[f] = Math.max(0, av); adjTotal += av; }
      }
      newRow.total = Math.max(0, adjTotal);
      rows.push(newRow);
    }

    rows.sort((a, b) => a.date.localeCompare(b.date));
    return rows;
  },

  async getMonthlyStatsWithAdj(targetMonth) {
    const s = await this.getMonthlyStats(targetMonth);
    const fields = ['m_ele','f_ele','m_mid','f_mid','m_high','f_high','m_youth','f_youth','m_adult','f_adult','group_total'];
    const adjMap = await this.getMonthlyAdjs(targetMonth);

    // ★ v7: 기존 데이터가 있는 날짜 세트 — 해당 월만 조회 (전체 테이블 대신)
    const [start, end] = Util.monthRange(targetMonth);
    const daily = await API.list('daily_visitors', { date: [`gte.${start}`, `lt.${end}`] }, true);
    const existingDates = new Set();
    for (const row of daily) {
      if (row.date) existingDates.add(row.date);
    }

    for (const [dateStr, adj] of Object.entries(adjMap)) {
      if (!dateStr.startsWith(targetMonth)) continue;
      if (Object.keys(adj).length === 0) continue;
      // ★ 보정값만 있는 날짜도 운영일수에 포함
      if (!existingDates.has(dateStr)) {
        const hasPositive = Object.values(adj).some(v => (parseInt(v, 10) || 0) > 0);
        if (hasPositive) s.visit_days++;
      }
      for (const f of fields) {
        const av = parseInt(adj[f], 10) || 0;
        if (av !== 0 && s[f] !== undefined) {
          s[f] = Math.max(0, s[f] + av);
          s.total = Math.max(0, s.total + av);
        }
      }
    }
    return s;
  }
};