/**
 * 오정센터 청소년카페 키오스크 v4
 * - 대기 인원수 실시간 표시
 * - 운영시간 제한 (10:00~20:00) 안내
 * - 대기 호출 확인 플로우
 * - 시설 교차 예약 자동 해제 반영
 */

let userData = { name: '', phone: '', memberId: '', isAdmin: false };
let selectedGender = '';
let regType = '개인';

// ★ XSS 방지 유틸
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}

// ===== 시간 / 뷰 관리 =====
function updateClock() {
  const now = new Date();
  const str = now.toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
    weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const el = document.getElementById('datetime-display');
  if (el) el.textContent = str;
}
setInterval(updateClock, 1000);
updateClock();

// 자동 복귀 타이머 (2분간 조작 없으면 초기화면)
let inactivityTimer;
function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (userData.phone) goHome();
  }, 120000);
}
document.addEventListener('click', resetInactivityTimer);
document.addEventListener('touchstart', resetInactivityTimer);

function showView(id) {
  document.querySelectorAll('.view-section').forEach(v => v.classList.remove('active'));
  const t = document.getElementById(id);
  if (t) t.classList.add('active');
  // ★ 시설 선택 뷰로 갈 때마다 그리드 재빌드 (관리자 전용 시설 표시/숨김 반영)
  if (id === 'view-facilities') buildFacilityGrid();
  resetInactivityTimer();
}

function goHome() {
  userData = { name: '', phone: '', memberId: '', isAdmin: false };
  selectedGender = '';
  document.getElementById('display').value = '';
  document.getElementById('user-welcome').textContent = '고객';
  const wcEl = document.getElementById('user-welcome-choice');
  if (wcEl) wcEl.textContent = '고객';
  showView('view-entry');
}

// ===== ★ 입장 / 놀거리 예약 선택 =====
async function handleChoiceEnter() {
  // "입장" → 휴카페 이용 (시설 예약 없이 입장만)
  await Swal.fire({
    title: '입장 완료! ☕',
    html: `<p><strong>${escapeHtml(userData.name)}</strong>님, 환영합니다!</p><p style="font-size:0.9rem;color:#6B7280;">편안하게 쉬다 가세요 💜</p>`,
    icon: 'success',
    confirmButtonColor: '#4F7BF7',
    timer: 2500,
    timerProgressBar: true
  });
  goHome();
}

function handleChoicePlay() {
  // "놀거리 예약" → 메인 메뉴(공간이용하기 등) 표시
  showView('view-main');
}

// ===== 키패드 =====
function addVal(v) {
  const d = document.getElementById('display');
  if (d.value.length + v.length > 13) return;
  d.value += v;
}
function clearLast() {
  const d = document.getElementById('display');
  d.value = d.value.slice(0, -1);
}

// ===== 1. 번호 조회 & 입장 =====
async function submitSearch() {
  const phone = document.getElementById('display').value;
  const cleanP = Util.cleanPhone(phone);

  // ★ 관리자 전용 번호 감지 → 비밀번호 입력 팝업
  if (cleanP === AdminAuth.ADMIN_PHONE) {
    const { value: pw } = await Swal.fire({
      title: '🔒 관리자 로그인',
      input: 'password',
      inputLabel: '관리자 비밀번호를 입력하세요',
      inputPlaceholder: '비밀번호',
      showCancelButton: true,
      confirmButtonText: '로그인',
      cancelButtonText: '취소',
      confirmButtonColor: '#9B87F5',
      inputAttributes: { autocomplete: 'off' }
    });
    if (!pw) return;
    if (!AdminAuth.login(AdminAuth.ADMIN_ID, pw)) {
      return Swal.fire({ title: '로그인 실패', text: '비밀번호가 올바르지 않습니다.', icon: 'error' });
    }
    // 관리자 입장 처리 (실적 미카운트)
    Util.showLoading(true);
    try {
      const res = await Service.processSearch(cleanP);
      Util.showLoading(false);
      userData = {
        name: res.name, phone: cleanP,
        memberId: '__admin__', isAdmin: true
      };
      document.getElementById('user-welcome').textContent = '관리자';
      const wcEl = document.getElementById('user-welcome-choice');
      if (wcEl) wcEl.textContent = '관리자';
      await Swal.fire({
        title: '🔒 관리자 모드',
        html: '<p>관리자로 입장합니다.</p><p style="font-size:0.85rem;color:#6B5B8A;">실적 카운트 제외 · 운영시간 제한 없음</p>',
        icon: 'success', confirmButtonColor: '#9B87F5', timer: 2000, timerProgressBar: true
      });
      showView('view-choice');
    } catch (e) {
      Util.showLoading(false);
      console.error('[DEBUG] 관리자 입장 오류:', e);
      Swal.fire({ title: '서버 연결 오류', html: `<p>${e.message || '서버에 연결할 수 없습니다.'}</p><p style="font-size:0.82rem;color:#9CA3AF;margin-top:8px;">잠시 후 다시 시도해주세요.</p>`, icon: 'error', confirmButtonColor: '#4F7BF7' });
    }
    return;
  }

  if (cleanP.length < 10) {
    return Swal.fire({ title: '입력 오류', text: '전화번호를 정확히 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' });
  }

  userData = { name: '', phone: '', memberId: '', isAdmin: false };
  document.getElementById('user-welcome').textContent = '고객';

  Util.showLoading(true);
  try {
    const res = await Service.processSearch(phone);
    Util.showLoading(false);

    if (res.status === 'success') {
      userData = {
        name: res.name,
        phone: Util.cleanPhone(phone),
        memberId: res.memberId || '',
        isAdmin: false
      };
      document.getElementById('user-welcome').textContent = res.name;
      const wcEl2 = document.getElementById('user-welcome-choice');
      if (wcEl2) wcEl2.textContent = res.name;

      showView('view-choice');
    } else {
      // 미등록 → 회원가입
      document.getElementById('reg-phone').value = Util.formatPhone(phone);
      document.getElementById('reg-modal').classList.add('active');
      setRegType('개인');
    }
  } catch (e) {
    Util.showLoading(false);
    console.error('[DEBUG] submitSearch 오류:', e);
    Swal.fire({ title: '서버 연결 오류', html: `<p>${e.message || '서버에 연결할 수 없습니다.'}</p><p style="font-size:0.82rem;color:#9CA3AF;margin-top:8px;">잠시 후 다시 시도해주세요.</p>`, icon: 'error', confirmButtonColor: '#4F7BF7' });
  }
}

// ===== 2. 회원가입 =====
async function executeRegister() {
  const name = document.getElementById('reg-name').value.trim();
  const phone = document.getElementById('reg-phone').value;
  const consent = document.getElementById('reg-consent').checked;

  if (!name) return Swal.fire({ title: '알림', text: '이름(대표자)을 입력해주세요.', icon: 'warning' });
  if (!consent) return Swal.fire({ title: '알림', text: '개인정보 동의는 필수입니다.', icon: 'warning' });

  let data = { name, phone, regType };

  if (regType === '개인') {
    const birth = document.getElementById('reg-birth').value;
    if (!birth) {
      const y = document.getElementById('reg-birth-year').value;
      const m = document.getElementById('reg-birth-month').value;
      const d = document.getElementById('reg-birth-day').value;
      let msg = '생년월일을 입력해주세요.';
      if (!y || y.length !== 4) msg = '태어난 년도(4자리)를 입력해주세요.';
      else if (!m) msg = '태어난 월을 선택해주세요.';
      else if (!d) msg = '태어난 일을 선택해주세요.';
      return Swal.fire({ title: '알림', text: msg, icon: 'warning' });
    }
    if (!selectedGender) return Swal.fire({ title: '알림', text: '성별을 선택해주세요.', icon: 'warning' });
    data.birthdate = birth;
    data.gender = selectedGender;
  } else {
    const groupName = document.getElementById('reg-group-name').value.trim();
    if (!groupName) return Swal.fire({ title: '알림', text: '단체명을 입력해주세요.', icon: 'warning' });

    const rows = document.querySelectorAll('#group-members-container > .group-row');
    let summary = [];
    let total = 0;
    rows.forEach(row => {
      const age = row.querySelector('.g-age').value;
      const m = parseInt(row.querySelector('.g-male').value || 0);
      const f = parseInt(row.querySelector('.g-female').value || 0);
      if (m > 0 || f > 0) {
        summary.push(`${age}(남:${m},여:${f})`);
        total += m + f;
      }
    });
    if (total === 0) return Swal.fire({ title: '알림', text: '최소 1명 이상 입력해주세요.', icon: 'warning' });

    data.groupName = groupName;
    data.groupCount = total;
    data.groupDetail = summary.join(' / ');
    data.birthdate = '';
    data.gender = '단체';
  }

  Util.showLoading(true);
  try {
    const res = await Service.registerMember(data);
    Util.showLoading(false);

    if (regType === '개인') {
      userData = {
        name: res.name,
        phone: Util.cleanPhone(phone),
        memberId: res.memberId || ''
      };
      document.getElementById('user-welcome').textContent = res.name;
      closeRegModal();

      await Swal.fire({
        title: '가입 완료! 🎉',
        html: `<p>${res.message}</p>
          <div style="background:#E8EFFF;padding:14px;border-radius:10px;margin-top:12px;">
            <p style="margin:0 0 6px;font-size:0.85rem;color:#6B7280;">📱 모바일 예약 로그인 정보</p>
            <p style="margin:0;font-weight:700;color:#162443;">아이디: <span style="color:#4F7BF7;">${res.name}</span></p>
            <p style="margin:4px 0 0;font-weight:700;color:#162443;">비밀번호: <span style="color:#4F7BF7;">전화번호 뒷 4자리</span></p>
          </div>`,
        icon: 'success',
        confirmButtonColor: '#4F7BF7'
      });

      showView('view-main');
    } else {
      await Swal.fire({
        title: '단체 입장 완료!',
        text: res.message,
        icon: 'success',
        confirmButtonColor: '#4F7BF7'
      });
      closeRegModal();
      goHome();
    }
  } catch (e) {
    Util.showLoading(false);
    console.error(e);
    Swal.fire({ title: '서버 연결 오류', html: `<p>${e.message || '가입 처리 중 문제가 발생했습니다.'}</p><p style="font-size:0.82rem;color:#9CA3AF;margin-top:8px;">잠시 후 다시 시도해주세요.</p>`, icon: 'error', confirmButtonColor: '#4F7BF7' });
  }
}

// ===== 3. 퇴장 =====
async function handleExit() {
  // ★ 관리자 퇴장: 실적 미카운트로 조용히 종료
  if (userData.isAdmin) {
    const result = await Swal.fire({
      title: '관리자 로그아웃',
      text: '관리자 모드를 종료하시겠습니까?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: '로그아웃',
      cancelButtonText: '취소',
      confirmButtonColor: '#9B87F5'
    });
    if (!result.isConfirmed) return;
    Util.showLoading(true);
    try {
      await Service.processExit(userData.phone);
      AdminAuth.logout();
      Util.showLoading(false);
      await Swal.fire({ title: '로그아웃 완료', text: '관리자 모드가 종료되었습니다.', icon: 'success', timer: 1500, timerProgressBar: true });
    } catch (e) {
      Util.showLoading(false);
    }
    goHome();
    return;
  }

  const result = await Swal.fire({
    title: '퇴장하시겠습니까?',
    text: '이용 중인 모든 시설이 함께 종료됩니다.',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '퇴장',
    cancelButtonText: '취소',
    confirmButtonColor: '#FF6B9D',
    cancelButtonColor: '#9CA3AF'
  });
  if (!result.isConfirmed) return;

  if (!userData.phone) return goHome();
  Util.showLoading(true);
  try {
    await Service.processExit(userData.phone);
    Util.showLoading(false);
    const nm = userData.name;
    await Swal.fire({
      title: '안녕히 가세요! 👋',
      text: `${nm}님, 다음에 또 만나요!`,
      icon: 'success',
      confirmButtonColor: '#4F7BF7',
      timer: 2000,
      timerProgressBar: true
    });
    goHome();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '퇴장 처리 중 오류.', icon: 'error' });
  }
}

// ===== 4. 모바일 로그인 안내 =====
function showLoginInfo() {
  Swal.fire({
    title: '📱 모바일 예약 안내',
    html: `
      <div style="text-align:left;background:#F5F7FC;padding:18px;border-radius:12px;margin:12px 0;">
        <p style="font-weight:700;color:#162443;margin:0 0 8px;">휴대폰에서 예약하는 방법</p>
        <ol style="padding-left:18px;color:#6B7280;margin:0;line-height:1.8;">
          <li>휴대폰 브라우저에서 <strong>mobile.html</strong> 접속</li>
          <li>아이디: <strong style="color:#4F7BF7;">본인 이름</strong> 입력</li>
          <li>비밀번호: <strong style="color:#4F7BF7;">전화번호 뒷 4자리</strong> 입력</li>
          <li>로그인 후 시설 예약/대기/퇴장 가능!</li>
        </ol>
      </div>
    `,
    icon: 'info',
    confirmButtonColor: '#4F7BF7',
    confirmButtonText: '확인'
  });
}

// ===== 5. 시설 선택 그리드 (대기 인원수 표시) =====
async function buildFacilityGrid() {
  const grid = document.getElementById('facility-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="grid-loading"><i class="fas fa-spinner fa-spin"></i> 불러오는 중...</div>';

  // 대기 인원수 가져오기
  let waitCounts = {};
  try {
    waitCounts = await Service.getWaitlistCounts();
  } catch (e) { /* ignore */ }

  grid.innerHTML = '';
  const facs = FacilityConfig.facilities;
  for (const [name, config] of Object.entries(facs)) {
    // ★ adminOnly 시설은 관리자가 아니면 표시하지 않음
    if (config.adminOnly && !userData.isAdmin) continue;

    const btn = document.createElement('button');
    btn.className = 'facility-card';

    // ★ 관리자 전용 시설 표시 강조
    const adminBadge = config.adminOnly ? '<span style="font-size:0.65rem;color:#9B87F5;font-weight:700;">🔐 관리자</span>' : '';

    // ★ 대기 인원수 표시
    const facWaitKey = `__fac__${name}`;
    const waitCount = waitCounts[facWaitKey] || 0;
    const waitBadge = waitCount > 0 ? `<span class="wait-count-badge">대기 ${waitCount}명</span>` : '';

    btn.innerHTML = `<span class="emoji">${config.icon}</span><span class="label">${name}</span>${adminBadge}${waitBadge}`;

    if (config.subs === 'timeslot') {
      btn.onclick = () => showAdminTimeMenu(name);
    } else if (config.subs && config.subs.length > 0) {
      btn.onclick = () => showSubMenu(name, config.subs);
    } else {
      btn.onclick = () => doReserve(name);
    }

    grid.appendChild(btn);
  }
}

// ===== 6. 시설 예약 =====
async function doReserve(facility, detail = '') {
  if (!userData.phone) return Swal.fire({ title: '알림', text: '먼저 번호 조회로 입장해주세요.', icon: 'info' });

  // ★ 운영시간 체크 (관리자는 무시)
  if (!Util.isOperatingHours() && !userData.isAdmin) {
    return Swal.fire({
      title: '⏰ 운영시간 안내',
      html: '<p>운영시간은 <b>10:00 ~ 20:00</b>입니다.</p><p>운영시간 내에 예약해주세요.</p>',
      icon: 'warning',
      confirmButtonColor: '#4F7BF7'
    });
  }

  Util.showLoading(true);
  try {
    const res = await Service.reserveFacility(userData.phone, userData.name, facility, detail);
    Util.showLoading(false);

    if (res.status === 'error') {
      return Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }

    await Swal.fire({
      title: '예약 완료! 🎉',
      text: res.message,
      icon: 'success',
      confirmButtonColor: '#4F7BF7',
      timer: 2000,
      timerProgressBar: true
    });
    goHome();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '예약 중 오류가 발생했습니다.', icon: 'error' });
  }
}

// 대기 등록 (키오스크)
async function doWait(facility, detail = '') {
  if (!userData.phone) return Swal.fire({ title: '알림', text: '먼저 번호 조회로 입장해주세요.', icon: 'info' });

  // ★ 운영시간 체크 (관리자는 무시)
  if (!Util.isOperatingHours() && !userData.isAdmin) {
    return Swal.fire({
      title: '⏰ 운영시간 안내',
      html: '<p>운영시간은 <b>10:00 ~ 20:00</b>입니다.</p>',
      icon: 'warning',
      confirmButtonColor: '#4F7BF7'
    });
  }

  Util.showLoading(true);
  try {
    const res = await Service.joinWaitlist(userData.phone, userData.name, facility, detail);
    Util.showLoading(false);

    if (res.status === 'error') {
      return Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }

    await Swal.fire({
      title: '대기 등록 완료! ⏳',
      text: res.message,
      icon: 'success',
      confirmButtonColor: '#9B87F5',
      timer: 2500,
      timerProgressBar: true
    });
    goHome();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '대기 등록 중 오류가 발생했습니다.', icon: 'error' });
  }
}

// ★ 서브메뉴에 대기 인원수 표시
async function showSubMenu(title, subs) {
  Util.showLoading(true);
  try {
    const [occupied, waitCounts] = await Promise.all([
      Service.getOccupiedFacilities(),
      Service.getWaitlistCounts()
    ]);
    Util.showLoading(false);

    const config = FacilityConfig.facilities[title];
    document.getElementById('sub-title').textContent = title + ' 선택';
    const container = document.getElementById('sub-buttons');
    container.innerHTML = '';

    subs.forEach(s => {
      const full = `${title} ${s}`;
      const isOccupied = occupied.includes(full);
      const waitCount = waitCounts[full] || 0;
      const btn = document.createElement('button');
      btn.className = 'facility-card' + (isOccupied ? ' occupied-faded' : '');

      if (isOccupied && config && config.hasWaitlist) {
        btn.innerHTML = `
          <span class="emoji">🔒</span>
          <span class="label">${s}</span>
          <span class="tag-occupied">사용 중</span>
          ${waitCount > 0 
            ? `<span class="tag-wait-available">⏳ 대기 ${waitCount}명</span>` 
            : '<span class="tag-wait-available">⏳ 대기 가능</span>'}
        `;
        btn.onclick = async () => {
          // ★ v12f: 대기 예상시간 조회 후 표시
          Util.showLoading(true);
          let estHtml = '';
          try {
            const est = await Service.getWaitEstimate(title, s);
            const parts = [];
            if (est.hasActiveUser && est.currentRemain > 0) {
              parts.push(`현재 이용자 남은시간: <b>약 ${est.currentRemain}분</b>`);
            }
            if (est.aheadCount > 0) {
              parts.push(`앞 대기자: <b>${est.aheadCount}명</b> (1인당 ${est.baseTime}분)`);
            }
            if (est.estimateMin > 0) {
              estHtml = `<div style="margin:10px 0;padding:10px;background:#F5F3FF;border-radius:8px;border:1px solid #DDD6FE;">
                <p style="margin:0 0 4px;font-weight:700;color:#7C3AED;">⏱ 예상 대기시간: 약 ${est.estimateMin}분</p>
                <p style="margin:0;font-size:0.8rem;color:#6B7280;">${parts.join('<br>')}</p>
              </div>`;
            }
          } catch(e) { /* 예상시간 조회 실패해도 대기 등록은 가능 */ }
          Util.showLoading(false);

          const r = await Swal.fire({
            title: `${s} 사용 중`,
            html: `<p>현재 사용 중입니다.</p>${waitCount > 0 ? `<p>현재 대기 <b>${waitCount}</b>명</p>` : ''}${estHtml}<p>대기 등록하시겠습니까?</p>`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '⏳ 대기 등록',
            cancelButtonText: '취소',
            confirmButtonColor: '#9B87F5'
          });
          if (r.isConfirmed) await doWait(title, s);
        };
      } else if (isOccupied) {
        btn.classList.add('occupied');
        btn.innerHTML = `
          <span class="emoji">🔒</span>
          <span class="label">${s}</span>
          <span class="tag-occupied">사용 중</span>
        `;
        btn.onclick = () => Swal.fire({ title: '알림', text: '현재 사용 중인 공간입니다.', icon: 'info' });
      } else {
        // ★ 비어있어도 대기 인원수 표시
        const waitBadge = waitCount > 0 ? `<span class="wait-count-badge-sm">대기 ${waitCount}명</span>` : '';
        btn.innerHTML = `
          <span class="emoji">✨</span>
          <span class="label">${s}</span>
          ${waitBadge}
        `;
        btn.onclick = () => doReserve(title, s);
      }
      container.appendChild(btn);
    });
    showView('view-sub');
  } catch (e) {
    Util.showLoading(false);
    console.error(e);
  }
}

// ★ 관리자 전용 타임슬롯 메뉴 (요일별 시간대: 화~금 10-20시, 토 10-18시)
async function showAdminTimeMenu(facility) {
  // ★ 관리자는 일/월에도 예약 가능 (forceOpen=true)
  const isAdmin = userData && userData.isAdmin;
  const tsInfo = FacilityConfig.getAdminTimeSlots(isAdmin);

  // 일반 이용자만 일/월 차단 (관리자는 통과)
  if (tsInfo.closed) {
    return Swal.fire({
      title: '📅 예약 불가',
      text: tsInfo.reason,
      icon: 'warning',
      confirmButtonColor: '#9B87F5'
    });
  }

  Util.showLoading(true);
  try {
    const occupied = await Service.getOccupiedFacilities();
    Util.showLoading(false);

    const dayNames = ['일','월','화','수','목','금','토'];
    const dayOfWeek = Util.nowKST().getDay();
    const dayLabel = dayNames[dayOfWeek];
    const endLabel = tsInfo.endHour ? `${tsInfo.endHour}:00` : '20:00';

    document.getElementById('sub-title').textContent = `${facility} 시간 선택 (${dayLabel}요일 10:00~${endLabel})`;
    const container = document.getElementById('sub-buttons');
    container.innerHTML = '';
    const currentHour = Util.currentHour();

    tsInfo.slots.forEach(slot => {
      const full = `${facility} ${slot}`;
      const isOccupied = occupied.includes(full);
      const slotHour = parseInt(slot.split(':')[0]);
      // ★ 12:00~13:00 점심시간 예약 불가
      const isLunch = slotHour === 12;
      // 관리자는 지난 시간도 예약 가능하지만 시각적으로 표시
      const isPast = slotHour < currentHour && !userData.isAdmin;

      const btn = document.createElement('button');
      btn.className = 'facility-card' + (isLunch ? ' occupied' : '') + (isOccupied ? ' occupied' : '') + (isPast ? ' occupied' : '');
      const icon = isLunch ? '🍚' : (isPast ? '⏳' : (isOccupied ? '🔒' : '⏰'));
      const tag = isLunch ? '<span class="tag-occupied">점심시간</span>'
        : (isPast ? '<span class="tag-occupied">지난 시간</span>'
        : (isOccupied ? '<span class="tag-occupied">예약됨</span>' : ''));

      btn.innerHTML = `
        <span class="emoji">${icon}</span>
        <span class="label">${slot}</span>
        ${tag}
      `;

      if (isLunch) {
        btn.onclick = () => Swal.fire({ title: '🍚 점심시간', text: '12:00~13:00은 점심시간으로 예약할 수 없습니다.', icon: 'info', confirmButtonColor: '#9B87F5' });
      } else if (isPast) {
        btn.onclick = () => Swal.fire({ title: '알림', text: '이미 지난 시간입니다.', icon: 'info' });
      } else if (isOccupied && !userData.isAdmin) {
        btn.onclick = () => Swal.fire({ title: '알림', text: '이미 예약된 시간입니다.', icon: 'info' });
      } else {
        // 관리자는 사용 중이어도 예약 가능 (다른 사람 이름으로)
        btn.onclick = () => doReserve(facility, slot);
      }
      container.appendChild(btn);
    });
    showView('view-sub');
  } catch (e) {
    Util.showLoading(false);
    console.error(e);
  }
}

async function showTimeMenu(facility) {
  Util.showLoading(true);
  try {
    const occupied = await Service.getOccupiedFacilities();
    Util.showLoading(false);

    document.getElementById('sub-title').textContent = facility + ' 시간 선택';
    const container = document.getElementById('sub-buttons');
    container.innerHTML = '';
    const currentHour = Util.currentHour();

    const slots = FacilityConfig.getTimeSlots();
    slots.forEach(slot => {
      const full = `${facility} ${slot}`;
      const isOccupied = occupied.includes(full);
      const slotHour = parseInt(slot.split(':')[0]);
      const isPast = slotHour < currentHour;

      const btn = document.createElement('button');
      btn.className = 'facility-card' + (isOccupied || isPast ? ' occupied' : '');
      const icon = isPast ? '⏳' : (isOccupied ? '🔒' : '⏰');
      const tag = isPast ? '<span class="tag-occupied">지난 시간</span>' : (isOccupied ? '<span class="tag-occupied">예약됨</span>' : '');

      btn.innerHTML = `
        <span class="emoji">${icon}</span>
        <span class="label">${slot}</span>
        ${tag}
      `;
      btn.onclick = (isOccupied || isPast)
        ? () => Swal.fire({ title: '알림', text: isPast ? '이미 지난 시간입니다.' : '이미 예약된 시간입니다.', icon: 'info' })
        : () => doReserve(facility, slot);
      container.appendChild(btn);
    });
    showView('view-sub');
  } catch (e) {
    Util.showLoading(false);
    console.error(e);
  }
}

// ===== 7. 내 정보 =====
async function checkMyUsage() {
  if (!userData.phone) return;
  Util.showLoading(true);
  try {
    const count = await Service.getUserVisitCount(userData.phone);
    Util.showLoading(false);
    Swal.fire({
      title: `${userData.name}님!`,
      html: `이번 달 <b style="color:#4F7BF7; font-size:1.4rem;">${count}일</b> 방문하셨어요 😊`,
      icon: 'info',
      confirmButtonColor: '#4F7BF7'
    });
  } catch (e) { Util.showLoading(false); }
}

async function checkMyReservation() {
  if (!userData.phone) return;
  Util.showLoading(true);
  try {
    const active = await Service.getUserActiveReservations(userData.phone);
    const myWaits = await Service.getMyWaitlist(userData.phone);
    Util.showLoading(false);

    if (active.length === 0 && myWaits.length === 0) {
      return Swal.fire({ title: '📋 내 예약 내역', text: '진행 중인 예약 또는 대기가 없습니다.', icon: 'info', confirmButtonColor: '#4F7BF7' });
    }

    let html = '';

    if (active.length > 0) {
      html += '<div style="margin-bottom:12px;font-weight:700;color:#162443;">🏠 이용 중인 시설</div>';
      html += active.map(r => {
        let timeInfo = '';
        if (r.time_limit > 0) {
          const elapsed = Util.getElapsedMinutes(r.entry_time);
          const remain = r.time_limit - elapsed;
          timeInfo = remain > 0
            ? `<span style="color:#4F7BF7;">(${remain}분 남음)</span>`
            : `<span style="color:#FF6B9D;">(${Math.abs(remain)}분 초과)</span>`;
        }
        return `<div style="padding:8px 0; border-bottom:1px solid #eee;">
          <strong>${r.facility}</strong> ${r.detail || ''} ${timeInfo}
          <br><small style="color:#9CA3AF;">${r.entry_time} 시작</small>
        </div>`;
      }).join('');
    }

    if (myWaits.length > 0) {
      html += '<div style="margin-top:12px;margin-bottom:8px;font-weight:700;color:#9B87F5;">⏳ 대기 중인 시설</div>';
      html += myWaits.map(w => {
        const statusText = w.status === 'called' ? '<span style="color:#FF6B9D;font-weight:700;">🔔 호출됨! 관리자에게 확인해주세요</span>' : `대기 ${w.queue_number}번`;
        return `<div style="padding:8px 0; border-bottom:1px solid #eee;">
          <strong>${w.facility}</strong> ${w.detail && w.detail !== '-' ? w.detail : ''} - ${statusText}
        </div>`;
      }).join('');
    }

    Swal.fire({
      title: '📋 내 예약 내역',
      html: `<div style="text-align:left;">${html}</div>`,
      icon: 'info',
      confirmButtonColor: '#4F7BF7'
    });
  } catch (e) { Util.showLoading(false); }
}

// ===== 8. 회원가입 UI =====
function setGender(g) {
  selectedGender = g;
  document.getElementById('btn-male').classList.toggle('active-male', g === '남');
  document.getElementById('btn-female').classList.toggle('active-female', g === '여');
}

// ===== 생년월일 3단 셀렉트 =====
function updateBirthDays() {
  const yearEl = document.getElementById('reg-birth-year');
  const monthEl = document.getElementById('reg-birth-month');
  const dayEl = document.getElementById('reg-birth-day');
  const year = parseInt(yearEl.value) || 2010;
  const month = parseInt(monthEl.value) || 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const prevDay = dayEl.value;
  dayEl.innerHTML = '<option value="">일</option>';
  for (let d = 1; d <= daysInMonth; d++) {
    const val = String(d).padStart(2, '0');
    dayEl.innerHTML += `<option value="${val}"${val === prevDay ? ' selected' : ''}>${d}일</option>`;
  }
}

function updateBirthValue() {
  updateBirthDays();
  const y = document.getElementById('reg-birth-year').value;
  const m = document.getElementById('reg-birth-month').value;
  const d = document.getElementById('reg-birth-day').value;
  if (y && y.length === 4 && m && d) {
    document.getElementById('reg-birth').value = `${y}-${m}-${d}`;
  } else {
    document.getElementById('reg-birth').value = '';
  }
}

function setRegType(type) {
  regType = type;
  const isGroup = type === '단체';
  document.getElementById('type-private').classList.toggle('active', !isGroup);
  document.getElementById('type-group').classList.toggle('active', isGroup);
  document.getElementById('group-fields').style.display = isGroup ? 'block' : 'none';
  document.getElementById('private-fields').style.display = isGroup ? 'none' : 'block';
  document.getElementById('name-label').textContent = isGroup ? '대표자 이름' : '이름';
  document.getElementById('reg-name').placeholder = isGroup ? '대표자 이름' : '이름을 입력하세요';
  if (isGroup && document.getElementById('group-members-container').children.length === 0) addGroupRow();
}

function addGroupRow() {
  const c = document.getElementById('group-members-container');
  const id = 'row-' + Date.now();
  const div = document.createElement('div');
  div.id = id;
  div.className = 'group-row';
  div.innerHTML = `
    <select class="g-age">
      <option value="초등">초등</option>
      <option value="중등">중등</option>
      <option value="고등">고등</option>
      <option value="성인">성인</option>
    </select>
    <input type="number" class="g-male" placeholder="남" min="0">
    <input type="number" class="g-female" placeholder="여" min="0">
    <button type="button" class="remove-btn" onclick="document.getElementById('${id}').remove()">
      <i class="fas fa-times-circle"></i>
    </button>
  `;
  c.appendChild(div);
}

function closeRegModal() {
  document.getElementById('reg-modal').classList.remove('active');
  document.getElementById('display').value = '';
  document.getElementById('reg-name').value = '';
  document.getElementById('reg-birth').value = '';
  // 생년월일 3단 셀렉트 초기화
  const birthYear = document.getElementById('reg-birth-year');
  const birthMonth = document.getElementById('reg-birth-month');
  const birthDay = document.getElementById('reg-birth-day');
  if (birthYear) birthYear.value = '';
  if (birthMonth) birthMonth.value = '';
  if (birthDay) { birthDay.innerHTML = '<option value="">일</option>'; }
  if (document.getElementById('reg-group-name')) document.getElementById('reg-group-name').value = '';
  document.getElementById('group-members-container').innerHTML = '';
  document.getElementById('reg-consent').checked = false;
  selectedGender = '';
  document.getElementById('btn-male').classList.remove('active-male');
  document.getElementById('btn-female').classList.remove('active-female');
}

// ===== 관리자 인증 후 페이지 이동 =====
async function authAndGo(url) {
  const { value: pw } = await Swal.fire({
    title: '🔒 관리자 인증',
    input: 'password',
    inputLabel: '관리자 인증번호를 입력하세요',
    inputPlaceholder: '인증번호',
    showCancelButton: true,
    confirmButtonText: '확인',
    cancelButtonText: '취소',
    confirmButtonColor: '#9B87F5',
    inputAttributes: { autocomplete: 'off' }
  });
  if (!pw) return;
  if (pw !== 'admin1388!') {
    return Swal.fire({ title: '인증 실패', text: '인증번호가 올바르지 않습니다.', icon: 'error' });
  }
  window.location.href = url;
}

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  buildFacilityGrid();
});
