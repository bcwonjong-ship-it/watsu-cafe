/**
 * 오정센터 청소년카페 모바일 예약 v5
 * - 대기 호출 → 사용자 확인 플로우
 * - 대기 인원수 실시간 표시
 * - 운영시간 제한 (10:00~20:00)
 * - 시설 교차 예약 자동 해제 반영
 */

let mUser = null;

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  const saved = sessionStorage.getItem('mUser');
  if (saved) {
    mUser = JSON.parse(saved);
    mEnterDashboard();
  } else {
    mShowView('m-view-auth');
  }
});

// ===== 로그인 (이름 + 폰뒷4자리) =====
async function mobileLogin() {
  const name = document.getElementById('m-login-name').value.trim();
  const pin = document.getElementById('m-login-pin').value.trim();

  if (!name) return Swal.fire({ title: '알림', text: '이름을 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' });
  if (!pin || pin.length !== 4) return Swal.fire({ title: '알림', text: '전화번호 뒷 4자리를 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' });

  Util.showLoading(true);
  try {
    const member = await Service.loginByNameAndPin(name, pin);
    if (!member) {
      Util.showLoading(false);
      return Swal.fire({
        title: '로그인 실패',
        html: '등록되지 않은 정보입니다.<br><small>키오스크에서 먼저 회원가입해주세요.</small>',
        icon: 'error',
        confirmButtonColor: '#4F7BF7'
      });
    }

    mUser = {
      name: member.name,
      phone: member.phone,
      memberId: member.id
    };
    sessionStorage.setItem('mUser', JSON.stringify(mUser));

    // 입장 처리 (이미 입장이면 무시)
    await Service.processSearch(mUser.phone);
    Util.showLoading(false);

    await mEnterDashboard();
  } catch (e) {
    Util.showLoading(false);
    console.error(e);
    Swal.fire({ title: '서버 연결 오류', html: `<p>${e.message || '서버에 연결할 수 없습니다.'}</p><p style="font-size:0.82rem;color:#9CA3AF;margin-top:8px;">잠시 후 다시 시도해주세요.</p>`, icon: 'error', confirmButtonColor: '#4F7BF7' });
  }
}

// ===== 대시보드 =====
async function mEnterDashboard() {
  document.getElementById('m-user-name').textContent = mUser.name + '님';
  document.getElementById('m-logout-btn').style.display = 'inline-flex';
  await buildMobileFacilityGrid();
  await mRefreshAll();
  mShowView('m-view-dashboard');
}

function mShowView(id) {
  document.querySelectorAll('.m-view').forEach(v => v.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// ===== 전체 새로고침 =====
async function mRefreshAll() {
  await Promise.all([mRefreshStatus(), mRefreshWaitlist()]);
}

// ===== 이용 현황 =====
async function mRefreshStatus() {
  if (!mUser) return;
  try {
    const active = await Service.getUserActiveReservations(mUser.phone);
    const container = document.getElementById('m-my-status');

    if (active.length === 0) {
      container.innerHTML = '<div class="m-empty"><i class="fas fa-couch"></i><p>이용 중인 시설이 없습니다</p></div>';
      return;
    }

    container.innerHTML = active.map(r => {
      let timeDisplay = '';
      let timeClass = '';
      if (r.time_limit > 0) {
        const elapsed = Util.getElapsedMinutes(r.entry_time);
        const remain = r.time_limit - elapsed;
        if (remain > 0) {
          timeDisplay = `<span class="m-time-remain">${remain}분 남음</span>`;
        } else {
          timeDisplay = `<span class="m-time-over">${Math.abs(remain)}분 초과!</span>`;
          timeClass = 'time-over';
        }
      }
      const config = FacilityConfig.facilities[r.facility];
      const icon = config ? config.icon : '📍';

      return `
        <div class="m-status-card ${timeClass}">
          <div class="m-status-left">
            <span class="m-status-icon">${icon}</span>
            <div>
              <strong>${r.facility}</strong> ${r.detail && r.detail !== '-' ? r.detail : ''}
              ${timeDisplay}
              <br><small>${r.entry_time?.substring(0,5)} 시작</small>
            </div>
          </div>
          <button class="m-exit-facility-btn" onclick="mExitFacility('${r.id}', '${r.facility}')">
            <i class="fas fa-stop-circle"></i> 종료
          </button>
        </div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

// ===== 대기 현황 (호출 확인 버튼 추가) =====
async function mRefreshWaitlist() {
  if (!mUser) return;
  try {
    const myWaits = await Service.getMyWaitlist(mUser.phone);
    const section = document.getElementById('m-waitlist-section');
    const container = document.getElementById('m-my-waitlist');

    if (myWaits.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    container.innerHTML = myWaits.map(w => {
      const config = FacilityConfig.facilities[w.facility];
      const icon = config ? config.icon : '📍';
      
      let statusHtml = '';
      let actionHtml = '';
      
      if (w.status === 'called') {
        // ★ 호출됨 → 확인 버튼 표시 (사용자가 확인하면 이용 시작)
        statusHtml = '<span class="m-time-over">🔔 호출됨!</span>';
        actionHtml = `
          <div class="m-wait-actions">
            <button class="m-confirm-btn" onclick="mConfirmWait('${w.id}')">
              <i class="fas fa-check-circle"></i> 이용 시작
            </button>
            <button class="m-exit-facility-btn" onclick="mCancelWait('${w.id}')">
              <i class="fas fa-times"></i> 취소
            </button>
          </div>`;
      } else {
        statusHtml = `<span class="m-time-remain">대기 ${w.queue_number}번</span>`;
        actionHtml = `
          <button class="m-exit-facility-btn" onclick="mCancelWait('${w.id}')">
            <i class="fas fa-times"></i> 취소
          </button>`;
      }

      return `
        <div class="m-status-card ${w.status === 'called' ? 'called' : ''}">
          <div class="m-status-left">
            <span class="m-status-icon">${icon}</span>
            <div>
              <strong>${w.facility}</strong> ${w.detail && w.detail !== '-' ? w.detail : ''}
              ${statusHtml}
            </div>
          </div>
          ${actionHtml}
        </div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

// ★ 대기 호출 확인 (사용자가 이용 시작)
async function mConfirmWait(waitId) {
  const r = await Swal.fire({
    title: '🔔 호출 확인',
    html: '<p>관리자가 호출했습니다!</p><p>지금 이용을 시작하시겠습니까?</p>',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: '✅ 이용 시작',
    cancelButtonText: '나중에',
    confirmButtonColor: '#4F7BF7'
  });
  if (!r.isConfirmed) return;

  Util.showLoading(true);
  try {
    const res = await Service.confirmWaitlistEntry(waitId);
    Util.showLoading(false);
    if (res.status === 'success') {
      await Swal.fire({
        title: '이용 시작! 🎉',
        text: res.message,
        icon: 'success',
        confirmButtonColor: '#4F7BF7',
        timer: 2000,
        timerProgressBar: true
      });
      await mRefreshAll();
    } else {
      Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '처리 중 오류가 발생했습니다.', icon: 'error' });
  }
}

// ===== 시설 그리드 (대기 인원수 표시) =====
async function buildMobileFacilityGrid() {
  const grid = document.getElementById('m-facility-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="m-grid-loading"><i class="fas fa-spinner fa-spin"></i></div>';

  let waitCounts = {};
  try {
    waitCounts = await Service.getWaitlistCounts();
  } catch (e) { /* ignore */ }

  grid.innerHTML = '';
  for (const [name, config] of Object.entries(FacilityConfig.facilities)) {
    const btn = document.createElement('button');
    btn.className = 'm-facility-btn';

    // ★ 대기 인원수 배지
    const facWaitKey = `__fac__${name}`;
    const waitCount = waitCounts[facWaitKey] || 0;
    const waitBadge = waitCount > 0 ? `<span class="m-tag-wait">대기 ${waitCount}</span>` : '';

    btn.innerHTML = `<span class="m-fac-icon">${config.icon}</span><span class="m-fac-name">${name}</span>${waitBadge}`;

    if (config.subs === 'timeslot') {
      btn.onclick = () => mShowTimeMenu(name);
    } else if (config.subs && config.subs.length > 0) {
      btn.onclick = () => mShowSubMenu(name, config.subs);
    } else {
      btn.onclick = () => mDoReserve(name);
    }
    grid.appendChild(btn);
  }
}

// ===== 예약 =====
async function mDoReserve(facility, detail = '') {
  if (!mUser) return;

  // ★ 운영시간 체크
  if (!Util.isOperatingHours()) {
    return Swal.fire({
      title: '⏰ 운영시간 안내',
      html: '<p>운영시간은 <b>10:00 ~ 20:00</b>입니다.</p><p>운영시간 내에 예약해주세요.</p>',
      icon: 'warning',
      confirmButtonColor: '#4F7BF7'
    });
  }

  Util.showLoading(true);
  try {
    const res = await Service.reserveFacility(mUser.phone, mUser.name, facility, detail);
    Util.showLoading(false);
    if (res.status === 'error') {
      return Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
    await Swal.fire({ title: '예약 완료! 🎉', text: res.message, icon: 'success', confirmButtonColor: '#4F7BF7', timer: 2000, timerProgressBar: true });
    await mRefreshAll();
    mShowView('m-view-dashboard');
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '예약 중 오류', icon: 'error' });
  }
}

// 대기 등록 (모바일)
async function mJoinWait(facility, detail = '') {
  if (!mUser) return;

  // ★ 운영시간 체크
  if (!Util.isOperatingHours()) {
    return Swal.fire({
      title: '⏰ 운영시간 안내',
      html: '<p>운영시간은 <b>10:00 ~ 20:00</b>입니다.</p>',
      icon: 'warning',
      confirmButtonColor: '#4F7BF7'
    });
  }

  Util.showLoading(true);
  try {
    const res = await Service.joinWaitlist(mUser.phone, mUser.name, facility, detail);
    Util.showLoading(false);
    if (res.status === 'error') {
      return Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
    await Swal.fire({ title: '대기 등록! ⏳', text: res.message, icon: 'success', confirmButtonColor: '#9B87F5', timer: 2000, timerProgressBar: true });
    await mRefreshAll();
    mShowView('m-view-dashboard');
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '대기 등록 오류', icon: 'error' });
  }
}

// ★ 서브메뉴에 대기 인원수 표시
async function mShowSubMenu(title, subs) {
  Util.showLoading(true);
  try {
    const [occupied, waitCounts] = await Promise.all([
      Service.getOccupiedFacilities(),
      Service.getWaitlistCounts()
    ]);
    Util.showLoading(false);

    document.getElementById('m-sub-title').textContent = title + ' 선택';
    const container = document.getElementById('m-sub-buttons');
    container.innerHTML = '';
    const config = FacilityConfig.facilities[title];

    subs.forEach(s => {
      const full = `${title} ${s}`;
      const isOccupied = occupied.includes(full);
      const waitCount = waitCounts[full] || 0;
      const btn = document.createElement('button');
      btn.className = 'm-facility-btn' + (isOccupied ? ' occupied-visual' : '');

      if (isOccupied && config && config.hasWaitlist) {
        btn.innerHTML = `
          <span class="m-fac-icon">🔒</span>
          <span class="m-fac-name">${s}</span>
          <span class="m-tag-occupied">사용 중</span>
          ${waitCount > 0 ? `<span class="m-tag-wait">대기 ${waitCount}명</span>` : '<span class="m-tag-wait-available">대기 가능</span>'}
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
            html: `현재 사용 중입니다.${waitCount > 0 ? `<br>현재 대기 ${waitCount}명` : ''}${estHtml}<br>대기 등록하시겠습니까?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonText: '⏳ 대기 등록',
            cancelButtonText: '취소',
            confirmButtonColor: '#9B87F5'
          });
          if (r.isConfirmed) await mJoinWait(title, s);
        };
      } else if (isOccupied) {
        btn.classList.add('occupied');
        btn.innerHTML = `
          <span class="m-fac-icon">🔒</span>
          <span class="m-fac-name">${s}</span>
          <span class="m-tag-occupied">사용 중</span>
        `;
        btn.onclick = () => Swal.fire({ title: '알림', text: '현재 사용 중입니다.', icon: 'info' });
      } else {
        // ★ 빈 공간이어도 대기 인원 표시
        const waitBadge = waitCount > 0 ? `<span class="m-tag-wait">대기 ${waitCount}</span>` : '';
        btn.innerHTML = `
          <span class="m-fac-icon">✨</span>
          <span class="m-fac-name">${s}</span>
          ${waitBadge}
        `;
        btn.onclick = () => mDoReserve(title, s);
      }
      container.appendChild(btn);
    });
    mShowView('m-view-sub');
  } catch (e) { Util.showLoading(false); }
}

async function mShowTimeMenu(facility) {
  Util.showLoading(true);
  try {
    const occupied = await Service.getOccupiedFacilities();
    Util.showLoading(false);

    document.getElementById('m-sub-title').textContent = facility + ' 시간 선택';
    const container = document.getElementById('m-sub-buttons');
    container.innerHTML = '';
    const currentHour = Util.currentHour();

    FacilityConfig.getTimeSlots().forEach(slot => {
      const full = `${facility} ${slot}`;
      const isOccupied = occupied.includes(full);
      const slotHour = parseInt(slot.split(':')[0]);
      const isPast = slotHour < currentHour;

      const btn = document.createElement('button');
      btn.className = 'm-facility-btn' + ((isOccupied || isPast) ? ' occupied' : '');
      const icon = isPast ? '⏳' : (isOccupied ? '🔒' : '⏰');
      const tag = isPast ? '<span class="m-tag-occupied">지난 시간</span>' : (isOccupied ? '<span class="m-tag-occupied">예약됨</span>' : '');

      btn.innerHTML = `<span class="m-fac-icon">${icon}</span><span class="m-fac-name">${slot}</span>${tag}`;
      btn.onclick = (isOccupied || isPast)
        ? () => Swal.fire({ title: '알림', text: isPast ? '지난 시간입니다.' : '예약됨', icon: 'info' })
        : () => mDoReserve(facility, slot);
      container.appendChild(btn);
    });
    mShowView('m-view-sub');
  } catch (e) { Util.showLoading(false); }
}

// ===== 시설 퇴장 / 대기 취소 =====
async function mExitFacility(reservationId, facilityName) {
  const r = await Swal.fire({
    title: `${facilityName} 이용 종료`, text: '종료하시겠습니까?',
    icon: 'question', showCancelButton: true,
    confirmButtonText: '종료', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    await Service.exitFacility(reservationId);
    Util.showLoading(false);
    await mRefreshAll();
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

async function mCancelWait(waitId) {
  const r = await Swal.fire({
    title: '대기 취소', text: '대기를 취소하시겠습니까?',
    icon: 'question', showCancelButton: true,
    confirmButtonText: '취소하기', cancelButtonText: '돌아가기', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    await Service.cancelWaitlist(waitId);
    Util.showLoading(false);
    await mRefreshAll();
  } catch (e) { Util.showLoading(false); }
}

// ===== 퇴장 =====
async function mHandleExit() {
  if (!mUser) return;
  const r = await Swal.fire({
    title: '퇴장하시겠습니까?', text: '모든 시설 이용 + 대기가 종료됩니다.',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: '퇴장', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    await Service.processExit(mUser.phone);
    Util.showLoading(false);
    await Swal.fire({ title: '안녕히 가세요! 👋', text: `${mUser.name}님, 다음에 또 만나요!`, icon: 'success', confirmButtonColor: '#4F7BF7' });
    mLogout();
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

// ===== 방문 횟수 =====
async function mCheckVisitCount() {
  if (!mUser) return;
  Util.showLoading(true);
  try {
    const count = await Service.getUserVisitCount(mUser.phone);
    Util.showLoading(false);
    Swal.fire({
      title: `${mUser.name}님!`,
      html: `이번 달 <b style="color:#4F7BF7; font-size:1.5rem;">${count}일</b> 방문하셨어요 😊`,
      icon: 'info', confirmButtonColor: '#4F7BF7'
    });
  } catch (e) { Util.showLoading(false); }
}

// ===== ★ 내 바코드 (키오스크 스캐너/카메라로 입장용) =====
function mShowMyBarcode() {
  if (!mUser) return;
  const cleanP = Util.cleanPhone(mUser.phone);
  Swal.fire({
    title: `🏷️ ${mUser.name}님 회원 바코드`,
    html: `
      <p style="color:#6B7280;font-size:0.85rem;margin-bottom:12px;">키오스크 입장 시 이 화면을 스캐너/카메라에 비춰주세요</p>
      <div style="background:#fff;padding:16px;border-radius:8px;display:inline-block;">
        <svg id="my-barcode-svg"></svg>
      </div>
      <p style="margin-top:8px;font-weight:700;letter-spacing:1px;">${Util.formatPhone(cleanP)}</p>
    `,
    confirmButtonText: '닫기',
    confirmButtonColor: '#4F7BF7',
    didOpen: () => {
      JsBarcode('#my-barcode-svg', cleanP, { format: 'CODE128', width: 2, height: 70, displayValue: false });
    }
  });
}

// ===== 로그아웃 =====
function mLogout() {
  sessionStorage.removeItem('mUser');
  mUser = null;
  document.getElementById('m-user-name').textContent = '로그인 필요';
  document.getElementById('m-logout-btn').style.display = 'none';
  document.getElementById('m-login-name').value = '';
  document.getElementById('m-login-pin').value = '';
  mShowView('m-view-auth');
}

// 30초마다 자동 새로고침
setInterval(() => {
  if (mUser && document.getElementById('m-view-dashboard').classList.contains('active')) {
    mRefreshAll();
  }
}, 30000);
