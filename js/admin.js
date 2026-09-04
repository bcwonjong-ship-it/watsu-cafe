/**
 * 관리자 현황판 v9
 * - 대기 호출 → 사용자 확인 → 이용 시작 플로우
 * - 시설별 대기 인원수 표시 / 운영시간 표시
 * - ★ 대기열 대기 경과시간 표시
 * - ★ 시설이용 시작시간 + 남은시간 함께 표시
 * - ★ 관리자 직접 시설 추가/설정 (단체 대응)
 * - 통계 v4: Supabase DB 보정값 저장 + 보정 내역 히스토리
 * - 내보내기 비밀번호 잠금
 */

let alertedReservations = new Set();
let isSelectMode = false;
let selectedPhones = new Set();
const ADMIN_PIN = 'admin1388!';

// 30초마다 갱신
window.addEventListener('DOMContentLoaded', () => {
  loadData();
  setInterval(loadData, 30000);
  updateOperatingStatus();
  setInterval(updateOperatingStatus, 60000);
});

// ★ 운영시간 표시
function updateOperatingStatus() {
  const badge = document.getElementById('operating-status');
  if (!badge) return;
  if (Util.isOperatingHours()) {
    badge.textContent = '🟢 운영중';
    badge.className = 'operating-badge open';
  } else {
    badge.textContent = '🔴 운영종료';
    badge.className = 'operating-badge closed';
  }
}

async function loadData() {
  try {
    const users = await Service.getActiveUsers();
    renderUsers(users);
    await loadSummary(users);
    await loadWaitlists();
    await checkOverdueAlerts();
    await loadFacilityStatus();
    await loadAdminReserves();
  } catch (e) {
    console.error('[DEBUG] loadData 에러:', e);
    const errMsg = e.message || '알 수 없는 오류';
    document.getElementById('card-list').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>데이터 로딩 실패</p><p style="font-size:0.85rem;color:#9CA3AF;margin-top:8px;">${errMsg}</p><p style="font-size:0.8rem;color:#B0B0B0;margin-top:4px;">30초 후 자동 재시도합니다</p></div>`;
  }
}

// ===== 요약 =====
async function loadSummary(activeUsers) {
  const today = Util.todayStr();
  // ★ v9.3 egress 최적화: 오늘 방문자만 서버에서 필터링
  const todayVisitors = await API.list('daily_visitors', { date: `eq.${today}` });
  let todayCount = 0;
  todayVisitors.forEach(d => {
    if (d.gender === '단체' || (d.name || '').includes('단체')) {
      todayCount += (parseInt(d.group_count) || 0);
    } else { todayCount += 1; }
  });
  // ★ v9.3 egress 최적화: 오늘 + 아직 이용중인 예약만 조회
  const activeFac = (await API.list('facility_reservations', { date: `eq.${today}`, exit_time: 'eq.' }, true)).length;
  // ★ v9.3 egress 최적화: 오늘 + 활성 대기열만 조회
  const activeWaits = (await API.list('waitlist', { date: `eq.${today}`, status: 'in.(waiting,called)' }, true)).length;

  document.getElementById('sum-active').textContent = activeUsers.length;
  document.getElementById('sum-today').textContent = todayCount;
  document.getElementById('sum-fac').textContent = activeFac;
  document.getElementById('sum-wait').textContent = activeWaits;
}

// ===== 이용자 카드 렌더링 =====
function renderUsers(users) {
  const list = document.getElementById('card-list');
  document.getElementById('count').textContent = users.length;

  if (!users || users.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-mug-hot"></i><p>현재 이용 중인 사람이 없습니다.</p></div>';
    return;
  }

  // ★ 관리자를 상단 고정, 그 다음 시설 이용자 우선 정렬
  users.sort((a, b) => {
    const aIsAdmin = a.rawPhone === AdminAuth.ADMIN_PHONE ? 1 : 0;
    const bIsAdmin = b.rawPhone === AdminAuth.ADMIN_PHONE ? 1 : 0;
    if (aIsAdmin !== bIsAdmin) return bIsAdmin - aIsAdmin; // 관리자 먼저
    const aHasFac = a.reservations && a.reservations.length > 0 ? 1 : 0;
    const bHasFac = b.reservations && b.reservations.length > 0 ? 1 : 0;
    return bHasFac - aHasFac;
  });

  list.innerHTML = users.map(u => {
    let facilityHtml = '';
    if (u.reservations && u.reservations.length > 0) {
      facilityHtml = u.reservations.map(r => {
        let label = r.detail && r.detail !== '-' ? `${r.facility} ${r.detail}` : r.facility;
        let timeInfo = '';
        let timeClass = '';
        const config = FacilityConfig.facilities[r.facility];
        const icon = config ? config.icon : '📍';

        // ★ 시작 시간 표시
        const startTime = r.entry_time ? r.entry_time.substring(0, 5) : '';
        const startTimeHtml = startTime ? `<span class="fac-start-time"><i class="far fa-clock"></i> ${startTime}~</span>` : '';

        const tLimit = parseInt(r.time_limit, 10) || 0;
        if (tLimit > 0 && r.entry_time) {
          const elapsed = Util.getElapsedMinutes(r.entry_time);
          const remain = tLimit - elapsed;
          if (remain > 0) { timeInfo = `<span class="time-remain">(${remain}분 남음)</span>`; }
          else { timeInfo = `<span class="time-over">(${Math.abs(remain)}분 초과!)</span>`; timeClass = ' overdue'; }
        }

        let extendBtn = `<button class="admin-action-btn extend" onclick="event.stopPropagation(); extendTime('${r.id}', '${escapeHtml(r.facility)}')"><i class="fas fa-plus-circle"></i> 연장</button>`;

        return `<div class="facility-item${timeClass}">
          <span class="fac-item-icon">${icon}</span>
          <div class="fac-item-label">${escapeHtml(label)} ${timeInfo}${startTimeHtml}</div>
          <div class="fac-item-actions">
            ${extendBtn}
            <button class="admin-action-btn exit-fac" onclick="event.stopPropagation(); exitSingleFacility('${r.id}', '${escapeHtml(r.facility)}')"><i class="fas fa-stop-circle"></i> 종료</button>
          </div>
        </div>`;
      }).join('');
    } else {
      facilityHtml = '<div class="facility-item"><span class="fac-item-icon">☕</span><span class="fac-item-label">휴카페</span></div>';
    }

    // ★ 관리자 시설 추가 버튼 (선택모드가 아닐 때)
    if (!isSelectMode) {
      facilityHtml += `<button class="admin-add-fac-btn" onclick="event.stopPropagation(); adminAddFacility('${u.rawPhone}', '${escapeHtml(u.name)}')"><i class="fas fa-plus"></i> 시설 추가</button>`;
    }

    const groupBadge = u.groupCount ? `<span class="group-chip">${u.groupCount}</span>` : '';
    const checkboxHtml = isSelectMode
      ? `<input type="checkbox" class="user-select-checkbox" data-phone="${u.rawPhone}" ${selectedPhones.has(u.rawPhone) ? 'checked' : ''} onclick="event.stopPropagation(); toggleUserSelect('${u.rawPhone}')">`
      : '';

    const isAdminCard = u.rawPhone === AdminAuth.ADMIN_PHONE;
    const adminCardClass = isAdminCard ? ' admin-card' : '';
    const adminBadgeHtml = isAdminCard ? '<span class="admin-badge-chip">👑 관리자</span>' : '';

    const exitBtnHtml = !isSelectMode
      ? `<button class="admin-action-btn exit-user" onclick="event.stopPropagation(); exitSingleUser('${u.rawPhone}', '${escapeHtml(u.name)}')"><i class="fas fa-sign-out-alt"></i> 퇴장</button>`
      : '';

    return `
      <div class="user-card ${u.isGroup ? 'group-card' : ''}${adminCardClass} ${selectedPhones.has(u.rawPhone) ? 'selected' : ''}" onclick="${isSelectMode ? `toggleUserSelect('${u.rawPhone}')` : ''}">
        <div class="user-card-head">
          <div class="user-name">
            ${checkboxHtml}
            <i class="${u.isGroup ? 'fas fa-users' : 'fas fa-user-circle'}" style="color:${isAdminCard ? '#FF9800' : (u.isGroup ? 'var(--accent-purple)' : 'var(--primary)')};"></i>
            ${escapeHtml(u.name)} ${groupBadge}
            <span class="age-chip age-${u.ageGroup}">${u.ageGroup}</span>
            ${adminBadgeHtml}
          </div>
          ${exitBtnHtml}
        </div>
        <div class="user-phone"><i class="fas fa-phone-alt" style="font-size:0.75rem;"></i> ${u.phone}</div>
        <div class="user-time"><i class="far fa-clock"></i> ${u.entryTime} 입장</div>
        <div class="facility-list">
          <span class="fac-list-title">이용 시설</span>
          ${facilityHtml}
        </div>
      </div>`;
  }).join('');

  updateSelectedCount();
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== 다중 선택 모드 =====
function toggleSelectMode() {
  isSelectMode = !isSelectMode;
  selectedPhones.clear();
  document.getElementById('multi-exit-bar').style.display = isSelectMode ? 'flex' : 'none';
  document.getElementById('select-mode-text').textContent = isSelectMode ? '선택 해제' : '선택 퇴장';
  loadData();
}

function toggleUserSelect(phone) {
  if (selectedPhones.has(phone)) selectedPhones.delete(phone);
  else selectedPhones.add(phone);
  document.querySelectorAll('.user-card').forEach(card => {
    const cb = card.querySelector(`[data-phone="${phone}"]`);
    if (cb) {
      cb.checked = selectedPhones.has(phone);
      card.classList.toggle('selected', selectedPhones.has(phone));
    }
  });
  updateSelectedCount();
}

function selectAllUsers() {
  document.querySelectorAll('.user-select-checkbox').forEach(cb => {
    selectedPhones.add(cb.dataset.phone);
    cb.checked = true;
    cb.closest('.user-card').classList.add('selected');
  });
  updateSelectedCount();
}

function updateSelectedCount() {
  const el = document.getElementById('selected-count');
  if (el) el.textContent = selectedPhones.size;
}

async function exitSelectedUsers() {
  if (selectedPhones.size === 0) return Swal.fire({ title: '알림', text: '선택된 이용자가 없습니다.', icon: 'info' });
  const r = await Swal.fire({
    title: `${selectedPhones.size}명 퇴장`, text: '선택한 이용자를 퇴장 처리하시겠습니까?',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: '퇴장', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    const count = await Service.processMultiExit([...selectedPhones]);
    Util.showLoading(false);
    await Swal.fire({ title: '완료', text: `${count}명 퇴장 처리 완료`, icon: 'success', confirmButtonColor: '#4F7BF7' });
    toggleSelectMode();
    loadData();
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

// ===== 개별 퇴장 =====
async function exitSingleUser(rawPhone, displayName) {
  if (!rawPhone) {
    return Swal.fire({ title: '오류', text: '퇴장 처리 정보가 올바르지 않습니다.', icon: 'error' });
  }
  const r = await Swal.fire({
    title: '이용자 퇴장',
    html: `<p><strong>${displayName || rawPhone}</strong>님을<br>퇴장 처리하시겠습니까?</p><p style="font-size:0.85rem;color:#9CA3AF;">이용 중인 모든 시설도 함께 종료됩니다.</p>`,
    icon: 'question', showCancelButton: true,
    confirmButtonText: '퇴장', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    await Service.processExit(rawPhone);
    Util.showLoading(false);
    Swal.fire({ title: '퇴장 완료', text: `${displayName || '이용자'} 퇴장 처리되었습니다.`, icon: 'success', confirmButtonColor: '#4F7BF7', timer: 1500, timerProgressBar: true });
    loadData();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '퇴장 처리 중 문제가 발생했습니다.', icon: 'error' });
  }
}

// ===== 시설 종료 / 시간 연장 =====
async function exitSingleFacility(reservationId, facilityName) {
  const r = await Swal.fire({
    title: `${facilityName} 종료`, text: '이 시설 이용을 종료하시겠습니까?',
    icon: 'question', showCancelButton: true,
    confirmButtonText: '종료', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    await Service.exitFacility(reservationId);
    Util.showLoading(false);
    loadData();
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

async function extendTime(reservationId, facilityName) {
  const r = await Swal.fire({
    title: `${facilityName} 시간 연장`,
    html: `
      <p style="margin-bottom:14px;">연장할 시간(분)을 입력하세요</p>
      <div style="display:flex; gap:8px; justify-content:center; align-items:center; flex-wrap:wrap;">
        <button type="button" class="swal2-styled" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 14px;border-radius:8px;font-size:0.9rem;border:none;cursor:pointer;" onclick="document.getElementById('extend-min').value=10">10분</button>
        <button type="button" class="swal2-styled" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 14px;border-radius:8px;font-size:0.9rem;border:none;cursor:pointer;" onclick="document.getElementById('extend-min').value=20">20분</button>
        <button type="button" class="swal2-styled" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 14px;border-radius:8px;font-size:0.9rem;border:none;cursor:pointer;" onclick="document.getElementById('extend-min').value=30">30분</button>
        <button type="button" class="swal2-styled" style="background:#F3EFFF;color:#9B87F5;font-weight:700;padding:8px 14px;border-radius:8px;font-size:0.9rem;border:none;cursor:pointer;" onclick="document.getElementById('extend-min').value=60">60분</button>
      </div>
      <input id="extend-min" type="number" min="10" max="180" step="10" value="10"
        style="width:120px;text-align:center;font-size:1.4rem;font-weight:800;padding:12px;border:2px solid #E5E7EB;border-radius:10px;margin-top:14px;color:#162443;"
        onclick="this.select()">
      <span style="font-size:1.1rem;font-weight:700;color:#6B7280;margin-left:6px;">분</span>
    `,
    icon: 'question', showCancelButton: true,
    confirmButtonText: '연장', cancelButtonText: '취소', confirmButtonColor: '#4F7BF7',
    preConfirm: () => {
      const val = parseInt(document.getElementById('extend-min').value, 10);
      if (!val || val < 10) { Swal.showValidationMessage('10분 이상 입력해주세요'); return false; }
      return val;
    }
  });
  if (!r.isConfirmed || !r.value) return;
  Util.showLoading(true);
  try {
    const res = await Service.extendTime(reservationId, r.value);
    Util.showLoading(false);
    if (res.status === 'success') {
      alertedReservations.delete(reservationId);
      Swal.fire({ title: '연장 완료!', text: res.message, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
      loadData();
    }
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

// ===== 전체 퇴장 =====
async function handleAllExit() {
  const r = await Swal.fire({
    title: '전체 퇴장', text: '모든 이용자를 퇴장 처리하시겠습니까?',
    icon: 'warning', showCancelButton: true,
    confirmButtonText: '전체 퇴장', cancelButtonText: '취소', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    const count = await Service.processAllExit();
    Util.showLoading(false);
    Swal.fire({ title: '완료', text: `${count}명 퇴장 완료`, icon: 'success', confirmButtonColor: '#4F7BF7' });
    loadData();
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

// ===== 대기열 패널 =====
async function loadWaitlists() {
  try {
    const grouped = await Service.getAllWaitlists();
    const panel = document.getElementById('waitlist-panel');
    const content = document.getElementById('waitlist-content');
    const keys = Object.keys(grouped);
    if (keys.length === 0) { panel.style.display = 'none'; return; }
    panel.style.display = 'block';
    const nowMs = Date.now();
    content.innerHTML = keys.map(key => {
      const items = grouped[key];
      let facilityIcon = '📍';
      for (const [fName, fConfig] of Object.entries(FacilityConfig.facilities)) {
        if (key.startsWith(fName)) { facilityIcon = fConfig.icon; break; }
      }
      return `<div class="waitlist-group">
        <div class="waitlist-group-title">${facilityIcon} ${escapeHtml(key)} <span class="waitlist-count">${items.length}명 대기</span></div>
        <div class="waitlist-items">${items.map((w, i) => {
          let statusBadge = '', actionBtns = '';
          // ★ 대기 경과시간 계산
          const waitMs = w.created_at ? (nowMs - w.created_at) : 0;
          const waitMin = Math.max(0, Math.floor(waitMs / 60000));
          const waitTimeHtml = waitMin > 0 ? `<span class="waitlist-elapsed"><i class="fas fa-hourglass-half"></i> ${waitMin}분 대기</span>` : `<span class="waitlist-elapsed just-now"><i class="fas fa-hourglass-start"></i> 방금</span>`;
          if (w.status === 'called') {
            const calledMs = w.called_at ? (nowMs - w.called_at) : 0;
            const calledMin = Math.max(0, Math.floor(calledMs / 60000));
            const calledTimeStr = calledMin > 0 ? ` (${calledMin}분 전)` : ' (방금)';
            statusBadge = `<span class="waitlist-called-badge"><i class="fas fa-bell"></i> 호출됨${calledTimeStr}</span>`;
            actionBtns = `<button class="admin-action-btn extend" onclick="adminForceConfirm('${w.id}')"><i class="fas fa-play-circle"></i> 이용시작</button>
              <button class="admin-action-btn exit-fac" onclick="cancelWaitEntry('${w.id}')"><i class="fas fa-times"></i> 취소</button>`;
          } else {
            actionBtns = `<button class="admin-action-btn extend" onclick="callWaitEntry('${w.id}')"><i class="fas fa-bullhorn"></i> 호출</button>
              <button class="admin-action-btn exit-fac" onclick="cancelWaitEntry('${w.id}')"><i class="fas fa-times"></i> 취소</button>`;
          }
          return `<div class="waitlist-item ${w.status === 'called' ? 'called' : ''}">
            <span class="waitlist-num">${i + 1}</span>
            <div class="waitlist-info"><span class="waitlist-name">${escapeHtml(w.name)}</span><span class="waitlist-phone">${Util.formatPhone(w.phone)}</span>${waitTimeHtml}</div>
            ${statusBadge}<div class="waitlist-actions">${actionBtns}</div></div>`;
        }).join('')}</div></div>`;
    }).join('');
  } catch (e) { console.error(e); }
}

async function callWaitEntry(waitId) {
  Util.showLoading(true);
  try {
    await Service.callWaitlistEntry(waitId);
    Util.showLoading(false);
    playAlertSound();
    Swal.fire({ title: '호출 완료! 🔔', html: '<p>대기자에게 호출 알림이 전송되었습니다.</p>', icon: 'success', timer: 2000, confirmButtonColor: '#4F7BF7' });
    loadData();
  } catch (e) { Util.showLoading(false); }
}

async function adminForceConfirm(waitId) {
  const r = await Swal.fire({
    title: '이용 시작 처리', html: '<p>이 대기자의 이용을 시작 처리하시겠습니까?</p>',
    icon: 'question', showCancelButton: true, confirmButtonText: '이용 시작', cancelButtonText: '취소', confirmButtonColor: '#4F7BF7'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try {
    const res = await Service.confirmWaitlistEntry(waitId);
    Util.showLoading(false);
    if (res.status === 'success') {
      Swal.fire({ title: '이용 시작! ✅', text: res.message, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
      loadData();
    } else {
      Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', icon: 'error' }); }
}

async function cancelWaitEntry(waitId) {
  const r = await Swal.fire({
    title: '대기 취소', text: '이 대기자를 목록에서 제거하시겠습니까?',
    icon: 'question', showCancelButton: true, confirmButtonText: '제거', cancelButtonText: '돌아가기', confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;
  Util.showLoading(true);
  try { await Service.cancelWaitlist(waitId); Util.showLoading(false); loadData(); }
  catch (e) { Util.showLoading(false); }
}

// ===== 시간 초과 알림 =====
async function checkOverdueAlerts() {
  try {
    const overdue = await Service.getOverdueReservations();
    if (overdue.length === 0) { document.getElementById('alert-banner').style.display = 'none'; return; }
    const newOverdue = overdue.filter(r => !alertedReservations.has(r.id));
    if (newOverdue.length > 0) {
      newOverdue.forEach(r => alertedReservations.add(r.id));
      document.getElementById('alert-banner-text').innerHTML =
        '⚠️ 시간 초과: ' + overdue.map(r => `${escapeHtml(r.name)} - ${escapeHtml(r.facility)} (${r.overMinutes}분 초과)`).join(' | ');
      document.getElementById('alert-banner').style.display = 'block';
      playAlertSound();
    }
  } catch (e) { console.error(e); }
}

function playAlertSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator(); const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 800; osc.type = 'sine'; gain.gain.value = 0.3;
    osc.start(); setTimeout(() => { osc.stop(); ctx.close(); }, 300);
    setTimeout(() => {
      const c2 = new (window.AudioContext || window.webkitAudioContext)();
      const o2 = c2.createOscillator(); const g2 = c2.createGain();
      o2.connect(g2); g2.connect(c2.destination);
      o2.frequency.value = 1000; o2.type = 'sine'; g2.gain.value = 0.3;
      o2.start(); setTimeout(() => { o2.stop(); c2.close(); }, 300);
    }, 400);
  } catch (e) {}
}

function dismissAlert() { document.getElementById('alert-banner').style.display = 'none'; }

// ======================================================================
// ===== 통계 v3 (일별 + 연간 목표 + 작년 비교 + 보정값 편집) =====
// ======================================================================

function openStats() {
  document.getElementById('stats-modal').classList.add('active');
  document.getElementById('stats-month').value = Util.thisMonth();
  Service.clearStatsCache();  // ★ DB에서 최신 데이터 조회를 위해 캐시 초기화
  onStatsMonthChange();
}
function closeStats() { document.getElementById('stats-modal').classList.remove('active'); }

function switchStatsTab(tabName) {
  document.querySelectorAll('.stats-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.stats-tab-content').forEach(c => c.classList.remove('active'));
  document.getElementById('tab-' + tabName).classList.add('active');
}

async function onStatsMonthChange() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;
  Service.clearStatsCache();  // ★ 월 변경 시 캐시 초기화하여 최신 DB 데이터 조회
  Util.showLoading(true);
  try {
    await Promise.all([fetchStats(), fetchDailyBreakdown(), fetchYearlyProgress()]);
  } catch (e) { console.error(e); }
  Util.showLoading(false);
}

// ===== 탭1: 월간 요약 (보정값 적용 + 작년 비교) =====
async function fetchStats() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;
  try {
    const s = await Service.getMonthlyStatsWithAdj(m);
    document.getElementById('s-total').textContent = s.total || 0;
    document.getElementById('s-days').textContent = s.visit_days || 0;
    document.getElementById('s-group').textContent = s.group_total || 0;
    ['sm-ele','sm-mid','sm-high','sm-youth','sm-adult','sf-ele','sf-mid','sf-high','sf-youth','sf-adult'].forEach(id => {
      const key = id.replace('sm-','m_').replace('sf-','f_');
      document.getElementById(id).textContent = (s[key] || 0) + '명';
    });

    // ★ 작년 동월 비교 배너
    const prevYear = String(parseInt(m.slice(0,4)) - 1);
    const prevMonth = m.slice(5, 7);
    const prevData = await Service.getPrevYearMonthly(prevYear);
    const prevMonthData = prevData[prevMonth];
    const banner = document.getElementById('prev-year-compare');

    if (prevMonthData && parseInt(prevMonthData.total) > 0) {
      const prevTotal = parseInt(prevMonthData.total) || 0;
      const diff = (s.total || 0) - prevTotal;
      const pct = prevTotal > 0 ? Math.round(((s.total || 0) / prevTotal) * 100) : 0;
      const arrow = diff > 0 ? '📈' : (diff < 0 ? '📉' : '➡️');
      const diffColor = diff > 0 ? '#10B981' : (diff < 0 ? '#EF4444' : '#6B7280');
      const diffSign = diff > 0 ? '+' : '';
      banner.innerHTML = `
        <div class="prev-compare-content">
          <span class="prev-compare-label">${arrow} 작년 ${parseInt(prevMonth)}월 대비</span>
          <span class="prev-compare-values">
            작년 <strong>${prevTotal}명</strong> → 올해 <strong>${s.total || 0}명</strong>
            <span style="color:${diffColor};font-weight:900;margin-left:8px;">(${diffSign}${diff}명, ${pct}%)</span>
          </span>
        </div>`;
      banner.style.display = 'block';
    } else {
      banner.style.display = 'none';
    }
  } catch (e) { console.error(e); }
}

// ===== 탭2: 일별 현황 (보정값 + 작년 동일 + 행 클릭 편집) =====
async function fetchDailyBreakdown() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;
  try {
    const rows = await Service.getDailyBreakdownWithAdj(m);
    const tbody = document.getElementById('daily-table-body');
    const tfoot = document.getElementById('daily-table-foot');

    // 작년 동월 데이터
    const prevYear = String(parseInt(m.slice(0,4)) - 1);
    const prevMonth = m.slice(5, 7);
    const prevData = await Service.getPrevYearMonthly(prevYear);
    const prevMonthData = prevData[prevMonth];
    const prevTotal = prevMonthData ? (parseInt(prevMonthData.total) || 0) : 0;

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="14" style="text-align:center;color:var(--text-muted);padding:30px;">해당 월 데이터가 없습니다</td></tr>';
      tfoot.innerHTML = '';
      return;
    }

    const totals = { total: 0, m_ele: 0, f_ele: 0, m_mid: 0, f_mid: 0, m_high: 0, f_high: 0, m_youth: 0, f_youth: 0, m_adult: 0, f_adult: 0, group_total: 0 };

    tbody.innerHTML = rows.map(r => {
      const dayNum = r.date.slice(8, 10);
      const dow = ['일','월','화','수','목','금','토'][new Date(r.date).getDay()];
      const dowClass = dow === '일' ? ' sun' : (dow === '토' ? ' sat' : '');
      const adjClass = r._hasAdj ? ' has-adj' : '';
      Object.keys(totals).forEach(k => { totals[k] += (r[k] || 0); });
      const v = (val) => val ? val : '-';

      return `<tr class="daily-row${adjClass}" data-date="${r.date}" onclick="openAdjEditor('${r.date}')">
        <td class="${dowClass}">${parseInt(dayNum)}일(${dow})${r._hasAdj ? ' <i class="fas fa-pen" style="font-size:0.6rem;color:var(--accent-purple);"></i>' : ''}</td>
        <td class="total-col"><strong>${r.total}</strong></td>
        <td>${v(r.m_ele)}</td><td>${v(r.f_ele)}</td>
        <td>${v(r.m_mid)}</td><td>${v(r.f_mid)}</td>
        <td>${v(r.m_high)}</td><td>${v(r.f_high)}</td>
        <td>${v(r.m_youth)}</td><td>${v(r.f_youth)}</td>
        <td>${v(r.m_adult)}</td><td>${v(r.f_adult)}</td>
        <td>${v(r.group_total)}</td>
        <td class="prev-col">${prevTotal > 0 ? Math.round(prevTotal / rows.length) : '-'}</td>
      </tr>`;
    }).join('');

    tfoot.innerHTML = `<tr class="daily-total-row">
      <td><strong>합계</strong></td>
      <td class="total-col"><strong>${totals.total}</strong></td>
      <td><strong>${totals.m_ele || '-'}</strong></td><td><strong>${totals.f_ele || '-'}</strong></td>
      <td><strong>${totals.m_mid || '-'}</strong></td><td><strong>${totals.f_mid || '-'}</strong></td>
      <td><strong>${totals.m_high || '-'}</strong></td><td><strong>${totals.f_high || '-'}</strong></td>
      <td><strong>${totals.m_youth || '-'}</strong></td><td><strong>${totals.f_youth || '-'}</strong></td>
      <td><strong>${totals.m_adult || '-'}</strong></td><td><strong>${totals.f_adult || '-'}</strong></td>
      <td><strong>${totals.group_total || '-'}</strong></td>
      <td class="prev-col"><strong>${prevTotal || '-'}</strong></td>
    </tr>`;
  } catch (e) { console.error(e); }
}

// ===== ★ 보정값 편집 다이얼로그 (v2: DB 저장 + 메모) =====
async function openAdjEditor(dateStr) {
  const dayNum = parseInt(dateStr.slice(8, 10));
  const dow = ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
  const adj = await Service.getStatsAdj(dateStr);
  const fields = [
    { key: 'm_ele', label: '남초' }, { key: 'f_ele', label: '여초' },
    { key: 'm_mid', label: '남중' }, { key: 'f_mid', label: '여중' },
    { key: 'm_high', label: '남고' }, { key: 'f_high', label: '여고' },
    { key: 'm_youth', label: '남후청' }, { key: 'f_youth', label: '여후청' },
    { key: 'm_adult', label: '남성인' }, { key: 'f_adult', label: '여성인' },
    { key: 'group_total', label: '단체' }
  ];

  const inputsHtml = fields.map(f => {
    const val = adj[f.key] || 0;
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">
      <label style="font-size:0.85rem;font-weight:600;min-width:60px;">${f.label}</label>
      <input type="number" id="adj-${f.key}" value="${val}" style="width:80px;text-align:center;padding:6px;border:1px solid #E5E7EB;border-radius:6px;font-size:0.9rem;font-weight:700;" onclick="this.select()">
    </div>`;
  }).join('');

  const hasExisting = Object.values(adj).some(v => parseInt(v) !== 0);

  const r = await Swal.fire({
    title: `📝 ${dayNum}일(${dow}) 수치 보정`,
    html: `
      <p style="font-size:0.82rem;color:#6B7280;margin-bottom:10px;">
        양수(+)는 추가, 음수(-)는 차감합니다.<br>예: 남초 +2 → 남초 실적에 2명 추가
      </p>
      <div style="max-height:240px;overflow-y:auto;padding:4px;">${inputsHtml}</div>
      <div style="margin-top:10px;border-top:1px solid #E5E7EB;padding-top:10px;">
        <input type="text" id="adj-memo" placeholder="수정 사유 (선택)" maxlength="100"
          style="width:100%;padding:8px 10px;border:1px solid #E5E7EB;border-radius:6px;font-size:0.85rem;" value="">
      </div>
    `,
    confirmButtonText: '적용',
    cancelButtonText: '취소',
    confirmButtonColor: '#4F7BF7',
    showCancelButton: true,
    showDenyButton: hasExisting,
    denyButtonText: '보정 초기화',
    denyButtonColor: '#9CA3AF',
    preConfirm: () => {
      const result = {};
      fields.forEach(f => {
        const v = parseInt(document.getElementById(`adj-${f.key}`).value, 10) || 0;
        if (v !== 0) { result[f.key] = v; }
      });
      const memo = (document.getElementById('adj-memo').value || '').trim();
      return { adj: result, memo };
    }
  });

  if (r.isConfirmed) {
    Util.showLoading(true);
    try {
      await Service.setStatsAdj(dateStr, r.value.adj, r.value.memo);
      Util.showLoading(false);
      await Swal.fire({ title: '보정 적용! ✅', text: Object.keys(r.value.adj).length > 0 ? '수치가 보정되었습니다.' : '보정값이 초기화되었습니다.', icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
    } catch (e) {
      Util.showLoading(false);
      console.error('보정 저장 오류:', e);
      await Swal.fire({ title: '저장 오류', html: '<p>보정값 저장 중 문제가 발생했습니다.</p><p style="font-size:0.8rem;color:#9CA3AF;">localStorage에 백업 저장되었을 수 있습니다.</p>', icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
    onStatsMonthChange();
  } else if (r.isDenied) {
    Util.showLoading(true);
    try {
      await Service.clearStatsAdj(dateStr);
      Util.showLoading(false);
      await Swal.fire({ title: '초기화 완료', text: '해당 날짜의 보정값이 삭제되었습니다.', icon: 'info', timer: 1200, confirmButtonColor: '#4F7BF7' });
    } catch (e) {
      Util.showLoading(false);
      console.error('보정 초기화 오류:', e);
      await Swal.fire({ title: '오류', text: '보정값 초기화 중 문제가 발생했습니다.', icon: 'error', confirmButtonColor: '#4F7BF7' });
    }
    onStatsMonthChange();
  }
}

// ===== ★ 연간 목표 진행률 (올해 vs 작년 바 차트) =====
async function fetchYearlyProgress() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;
  const year = m.slice(0, 4);
  const prevYear = String(parseInt(year) - 1);

  document.getElementById('goal-year-label').textContent = year;
  const goal = await Service.getYearlyGoal(year);
  const { total, monthTotals } = await Service.getYearlyTotal(year);

  // 작년 데이터
  const prevYearData = await Service.getPrevYearTotal(prevYear);
  const hasPrev = prevYearData.total > 0;

  document.getElementById('goal-current').textContent = total.toLocaleString();
  document.getElementById('goal-target').textContent = goal > 0 ? goal.toLocaleString() : '미설정';

  let pct = 0;
  if (goal > 0) pct = Math.min(Math.round((total / goal) * 100), 100);
  document.getElementById('goal-pct').textContent = goal > 0 ? pct + '%' : '-';

  const fill = document.getElementById('goal-fill');
  fill.style.width = (goal > 0 ? pct : 0) + '%';
  fill.className = 'yearly-progress-fill';
  if (pct >= 100) fill.classList.add('complete');
  else if (pct >= 70) fill.classList.add('good');
  else if (pct >= 40) fill.classList.add('mid');

  // 월별 미니 바 차트 (올해 + 작년 겹침)
  const barsEl = document.getElementById('yearly-month-bars');
  const months = [];
  for (let i = 1; i <= 12; i++) {
    const mk = `${year}-${String(i).padStart(2, '0')}`;
    const pmk = `${prevYear}-${String(i).padStart(2, '0')}`;
    months.push({
      label: `${i}월`,
      value: monthTotals[mk] || 0,
      prev: prevYearData.monthTotals[pmk] || 0
    });
  }
  const maxVal = Math.max(...months.map(x => Math.max(x.value, x.prev)), 1);

  barsEl.innerHTML = months.map(mon => {
    const barH = Math.max(Math.round((mon.value / maxVal) * 100), mon.value > 0 ? 6 : 0);
    const prevH = hasPrev ? Math.max(Math.round((mon.prev / maxVal) * 100), mon.prev > 0 ? 6 : 0) : 0;
    return `<div class="month-bar-col">
      <div class="month-bar-val">${mon.value > 0 ? mon.value : ''}</div>
      <div class="month-bar-track">
        ${hasPrev ? `<div class="month-bar-fill prev" style="height:${prevH}%"></div>` : ''}
        <div class="month-bar-fill current" style="height:${barH}%"></div>
      </div>
      <div class="month-bar-label">${mon.label}</div>
    </div>`;
  }).join('');

  // 범례 표시
  document.getElementById('prev-year-legend').style.display = hasPrev ? 'flex' : 'none';

  // ★ v12f: 올해 전체 이용실적 요약 업데이트
  const ysSec = document.getElementById('yearly-summary-section');
  if (ysSec) {
    document.getElementById('yearly-sum-label').textContent = year;
    const activeMonths = Object.values(monthTotals).filter(v => v > 0).length;
    const totalDays = Object.keys(monthTotals).reduce((sum, mk) => {
      // monthTotals에 값이 있는 월의 운영일수 추정 (월별 total이 0보다 클 때)
      return sum + (monthTotals[mk] > 0 ? 1 : 0);
    }, 0);
    // getYearlyTotal은 monthTotals만 반환하므로 운영일수는 별도 계산 필요
    // 간이 계산: 각 월의 일별 데이터를 가져와야 정확하지만, 여기서는 월별 미니바 데이터 활용
    // total과 activeMonths로 일평균/월평균 계산
    document.getElementById('ys-total').textContent = total.toLocaleString() + '명';
    // 운영 월수
    const monthCount = activeMonths || 1;
    const monthAvg = Math.round(total / monthCount);
    document.getElementById('ys-mavg').textContent = monthAvg.toLocaleString() + '명';
    // 일평균은 목표 섹션의 운영일수를 활용 불가하므로 월평균/22일로 추정
    const estDays = activeMonths * 22; // 추정 운영일수 (월 22일 기준)
    const dayAvg = estDays > 0 ? Math.round(total / estDays) : 0;
    document.getElementById('ys-days').textContent = (activeMonths > 0 ? activeMonths + '개월' : '-');
    document.getElementById('ys-avg').textContent = dayAvg > 0 ? dayAvg.toLocaleString() + '명' : '-';
    ysSec.style.display = total > 0 ? 'block' : 'none';
  }
}

// ===== ★ 목표 설정 =====
async function openGoalSetting() {
  const m = document.getElementById('stats-month').value;
  const year = m ? m.slice(0, 4) : new Date().getFullYear().toString();
  const currentGoal = await Service.getYearlyGoal(year);

  const r = await Swal.fire({
    title: `🎯 ${year}년 연간 목표 설정`,
    html: `
      <p style="margin-bottom:14px;color:#6B7280;font-size:0.9rem;">연간 총 방문 목표 인원수를 설정하세요</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 12px;border-radius:8px;font-size:0.85rem;border:none;cursor:pointer;" onclick="document.getElementById('goal-input').value=3000">3,000</button>
        <button type="button" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 12px;border-radius:8px;font-size:0.85rem;border:none;cursor:pointer;" onclick="document.getElementById('goal-input').value=5000">5,000</button>
        <button type="button" style="background:#E8EFFF;color:#4F7BF7;font-weight:700;padding:8px 12px;border-radius:8px;font-size:0.85rem;border:none;cursor:pointer;" onclick="document.getElementById('goal-input').value=8000">8,000</button>
        <button type="button" style="background:#F3EFFF;color:#9B87F5;font-weight:700;padding:8px 12px;border-radius:8px;font-size:0.85rem;border:none;cursor:pointer;" onclick="document.getElementById('goal-input').value=10000">10,000</button>
      </div>
      <input id="goal-input" type="number" min="0" step="100" value="${currentGoal || ''}" placeholder="목표 인원수"
        style="width:200px;text-align:center;font-size:1.3rem;font-weight:800;padding:12px;border:2px solid #E5E7EB;border-radius:10px;color:#162443;" onclick="this.select()">
      <span style="font-size:1rem;font-weight:700;color:#6B7280;margin-left:6px;">명</span>
    `,
    confirmButtonText: '저장', cancelButtonText: '취소', confirmButtonColor: '#4F7BF7',
    showCancelButton: true, showDenyButton: true, denyButtonText: '목표 삭제', denyButtonColor: '#9CA3AF',
    preConfirm: () => {
      const val = parseInt(document.getElementById('goal-input').value, 10);
      if (!val || val < 1) { Swal.showValidationMessage('1 이상의 목표를 입력해주세요'); return false; }
      return val;
    }
  });

  if (r.isConfirmed && r.value) {
    await Service.setYearlyGoal(year, r.value);
    Swal.fire({ title: '저장 완료!', text: `${year}년 목표: ${r.value.toLocaleString()}명`, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
    fetchYearlyProgress();
  } else if (r.isDenied) {
    await Service.setYearlyGoal(year, 0);
    Swal.fire({ title: '삭제 완료', text: '연간 목표가 삭제되었습니다.', icon: 'info', timer: 1500, confirmButtonColor: '#4F7BF7' });
    fetchYearlyProgress();
  }
}

// ===== ★ 작년 실적 입력 (월별) =====
async function openPrevYearInput() {
  const m = document.getElementById('stats-month').value;
  const year = m ? m.slice(0, 4) : new Date().getFullYear().toString();
  const prevYear = String(parseInt(year) - 1);
  const prevData = await Service.getPrevYearMonthly(prevYear);

  let rows = '';
  for (let i = 1; i <= 12; i++) {
    const mm = String(i).padStart(2, '0');
    const d = prevData[mm] || {};
    rows += `<div style="display:flex;align-items:center;gap:8px;padding:3px 0;">
      <span style="font-weight:700;min-width:36px;font-size:0.85rem;">${i}월</span>
      <input type="number" id="prev-${mm}" value="${d.total || ''}" placeholder="인원수"
        style="flex:1;padding:6px 8px;border:1px solid #E5E7EB;border-radius:6px;font-size:0.9rem;font-weight:600;text-align:center;" onclick="this.select()">
    </div>`;
  }

  const r = await Swal.fire({
    title: `📅 ${prevYear}년 실적 입력`,
    html: `
      <p style="font-size:0.82rem;color:#6B7280;margin-bottom:10px;">작년 월별 총 방문 인원수를 입력하세요.<br>올해 실적과 비교하여 표시됩니다.</p>
      <div style="max-height:320px;overflow-y:auto;padding:4px;">${rows}</div>
    `,
    confirmButtonText: '저장', cancelButtonText: '취소', confirmButtonColor: '#FF9800',
    showCancelButton: true,
    showDenyButton: Object.keys(prevData).length > 0,
    denyButtonText: '전체 삭제', denyButtonColor: '#9CA3AF',
    preConfirm: () => {
      const result = {};
      for (let i = 1; i <= 12; i++) {
        const mm = String(i).padStart(2, '0');
        const val = parseInt(document.getElementById(`prev-${mm}`).value, 10) || 0;
        if (val > 0) result[mm] = { total: val };
      }
      return result;
    }
  });

  if (r.isConfirmed) {
    // 각 월 저장
    for (const [mm, d] of Object.entries(r.value)) {
      await Service.setPrevYearMonth(prevYear, mm, d);
    }
    // 입력 안 된 월 제거
    for (let i = 1; i <= 12; i++) {
      const mm = String(i).padStart(2, '0');
      if (!r.value[mm]) await Service.setPrevYearMonth(prevYear, mm, {});
    }
    Swal.fire({ title: '저장 완료!', text: `${prevYear}년 실적이 저장되었습니다.`, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
    onStatsMonthChange();
  } else if (r.isDenied) {
    // DB에서 모든 월 데이터 삭제
    for (let i = 1; i <= 12; i++) {
      const mm = String(i).padStart(2, '0');
      await Service.setPrevYearMonth(prevYear, mm, {});
    }
    localStorage.removeItem(`cafe_prev_year_monthly_${prevYear}`);
    Swal.fire({ title: '삭제 완료', text: '작년 실적이 모두 삭제되었습니다.', icon: 'info', timer: 1500, confirmButtonColor: '#4F7BF7' });
    onStatsMonthChange();
  }
}

// ===== ★ 내보내기 (비밀번호 잠금) =====
async function openExportWithAuth() {
  // 세션 중 인증 확인
  if (sessionStorage.getItem('export_auth') === 'ok') {
    openExport();
    return;
  }

  const r = await Swal.fire({
    title: '🔒 비밀번호 확인',
    html: '<p style="color:#6B7280;">데이터 내보내기를 위해 비밀번호를 입력해주세요.</p>',
    input: 'password',
    inputPlaceholder: '비밀번호 입력',
    inputAttributes: { autocomplete: 'off', inputmode: 'numeric', maxlength: '10' },
    confirmButtonText: '확인', cancelButtonText: '취소', confirmButtonColor: '#4F7BF7',
    showCancelButton: true,
    preConfirm: (val) => {
      if (val !== ADMIN_PIN) { Swal.showValidationMessage('비밀번호가 올바르지 않습니다'); return false; }
      return true;
    }
  });

  if (r.isConfirmed) {
    sessionStorage.setItem('export_auth', 'ok');
    openExport();
  }
}

async function openExport() {
  await Swal.fire({
    title: '📤 데이터 내보내기',
    html: `
      <p style="margin-bottom:16px;">Google Sheets 형식의 CSV 파일로 내보냅니다.</p>
      <div style="text-align:left; display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-primary btn-block" onclick="doExport('members')" style="padding:12px;">📋 명단(개인)</button>
        <button class="btn btn-primary btn-block" onclick="doExport('logs')" style="padding:12px;">📝 입퇴장 기록</button>
        <button class="btn btn-primary btn-block" onclick="doExport('reservations')" style="padding:12px;">🏠 시설예약 현황</button>
        <button class="btn btn-primary btn-block" onclick="doExport('daily')" style="padding:12px;">📊 누적 이용 기록</button>
      </div>
    `,
    showConfirmButton: false, showCloseButton: true
  });
}

async function doExport(type) {
  Util.showLoading(true);
  try {
    if (type === 'members') {
      const members = await API.list('members');
      GSheets.exportToCSV(GSheets.formatMembersForSheet(members), `명단_개인_${Util.todayStr()}.csv`);
    } else if (type === 'logs') {
      const logs = await API.list('access_logs');
      GSheets.exportToCSV(GSheets.formatAccessLogsForSheet(logs), `입퇴장기록_${Util.todayStr()}.csv`);
    } else if (type === 'reservations') {
      const reserves = await API.list('facility_reservations');
      GSheets.exportToCSV(GSheets.formatReservationsForSheet(reserves), `시설예약_${Util.todayStr()}.csv`);
    } else if (type === 'daily') {
      const daily = await API.list('daily_visitors');
      GSheets.exportToCSV(GSheets.formatDailyVisitorsForSheet(daily), `누적이용_${Util.todayStr()}.csv`);
    }
    Util.showLoading(false);
  } catch (e) { Util.showLoading(false); Swal.fire({ title: '오류', text: '내보내기 실패', icon: 'error' }); }
}

// ======================================================================
// ===== ★ 시설별 이용현황 패널 (v10.1 — 종료버튼 + 대기목록 통합) =====
// ======================================================================
async function loadFacilityStatus() {
  const grid = document.getElementById('facility-status-grid');
  if (!grid) return;

  try {
    const today = Util.todayStr();
    // ★ egress 최적화: 오늘 날짜만 서버사이드 필터
    const reserves = await API.list('facility_reservations', { date: `eq.${today}` });
    const activeToday = reserves.filter(r => isExitEmpty(r.exit_time));

    // 대기열 데이터 가져오기 — ★ egress 최적화: 오늘 + 활성 상태만 서버사이드 필터
    const waits = await API.list('waitlist', { date: `eq.${today}`, status: 'in.(waiting,called)' });
    const activeWaits = waits
      .slice()
      .sort((a, b) => (a.created_at || 0) - (b.created_at || 0));

    const facilities = FacilityConfig.facilities;
    const facNames = Object.keys(facilities).filter(f => !facilities[f].adminOnly);

    let html = '';
    facNames.forEach(facName => {
      const config = facilities[facName];
      const facReserves = activeToday.filter(r => r.facility === facName);
      const subs = Array.isArray(config.subs) ? config.subs : [];
      const totalSlots = subs.length || 1;
      const usedCount = facReserves.length;

      // 해당 시설의 대기자 목록
      const facWaits = activeWaits.filter(w => w.facility === facName);

      // 세부별 사용 현황
      let subsHtml = '';
      if (subs.length > 0) {
        subsHtml = subs.map(sub => {
          const subReserve = facReserves.find(r => r.detail === sub);
          if (subReserve) {
            const memberName = subReserve.name || '이용자';
            const elapsed = subReserve.entry_time ? Util.getElapsedMinutes(subReserve.entry_time) : 0;
            const tLimit = parseInt(subReserve.time_limit, 10) || 0;
            let timeTag = '';
            if (tLimit > 0) {
              const remain = tLimit - elapsed;
              timeTag = remain > 0
                ? `<span class="fac-st-time ok">${remain}분</span>`
                : `<span class="fac-st-time over">${Math.abs(remain)}분 초과</span>`;
            } else {
              timeTag = `<span class="fac-st-time ok">${elapsed}분</span>`;
            }
            return `<div class="fac-st-sub used">
              <span class="fac-st-sub-name">${escapeHtml(sub)}</span>
              <span class="fac-st-sub-user">${escapeHtml(memberName)}</span>
              ${timeTag}
              <button class="fac-st-extend-btn" onclick="extendTime('${subReserve.id}', '${escapeHtml(facName)}')" title="시간 연장"><i class="fas fa-plus-circle"></i></button>
              <button class="fac-st-exit-btn" onclick="exitSingleFacility('${subReserve.id}', '${escapeHtml(facName)}')"><i class="fas fa-stop-circle"></i></button>
            </div>`;
          } else {
            return `<div class="fac-st-sub empty">
              <span class="fac-st-sub-name">${escapeHtml(sub)}</span>
              <span class="fac-st-sub-user">비어있음</span>
            </div>`;
          }
        }).join('');
      } else {
        // 보드게임 등 subs가 없는 시설
        if (usedCount > 0) {
          subsHtml = facReserves.map(r => {
            const memberName = r.name || '이용자';
            const elapsed = r.entry_time ? Util.getElapsedMinutes(r.entry_time) : 0;
            return `<div class="fac-st-sub used">
              <span class="fac-st-sub-user">${escapeHtml(memberName)}</span>
              <span class="fac-st-time ok">${elapsed}분</span>
              <button class="fac-st-extend-btn" onclick="extendTime('${r.id}', '${escapeHtml(facName)}')" title="시간 연장"><i class="fas fa-plus-circle"></i></button>
              <button class="fac-st-exit-btn" onclick="exitSingleFacility('${r.id}', '${escapeHtml(facName)}')"><i class="fas fa-stop-circle"></i></button>
            </div>`;
          }).join('');
        } else {
          subsHtml = `<div class="fac-st-sub empty"><span class="fac-st-sub-user">이용자 없음</span></div>`;
        }
      }

      // ★ 대기목록 (해당 시설) + v12f: 예상 대기시간 표시
      let waitHtml = '';
      if (facWaits.length > 0) {
        const nowMs = Date.now();
        // ★ v12f: 현재 이용자 남은시간 계산 (가장 빨리 끝나는 사람 기준)
        const baseTime = FacilityConfig.getTimeLimit(facName);
        const activeRemains = facReserves.map(r => {
          const tLimit = parseInt(r.time_limit, 10) || 0;
          if (tLimit <= 0) return 0;
          const elapsed = Util.getElapsedMinutes(r.entry_time);
          return Math.max(tLimit - elapsed, 0);
        }).filter(r => r > 0);
        const minRemain = activeRemains.length > 0 ? Math.min(...activeRemains) : 0;

        const waitItems = facWaits.map((w, i) => {
          const waitMs = w.created_at ? (nowMs - w.created_at) : 0;
          const waitMin = Math.max(0, Math.floor(waitMs / 60000));
          const waitTimeStr = waitMin > 0 ? `${waitMin}분` : '방금';
          const detailStr = w.detail && w.detail !== '-' ? ` (${escapeHtml(w.detail)})` : '';
          const isCalled = w.status === 'called';
          // ★ v12f: 각 대기자별 예상 대기시간 = 현재 이용자 남은시간 + (앞 순서 × 기본시간)
          const estMin = minRemain + (i * baseTime);
          const estStr = estMin > 0 ? `약 ${estMin}분` : '-';
          return `<div class="fac-st-wait-item ${isCalled ? 'called' : ''}">
            <span class="fac-st-wait-num">${i + 1}</span>
            <span class="fac-st-wait-name">${escapeHtml(w.name)}${detailStr}</span>
            <span class="fac-st-wait-time">${waitTimeStr}</span>
            <span style="font-size:0.7rem;color:#7C3AED;font-weight:600;margin-left:4px;">⏱${estStr}</span>
            ${isCalled ? '<span class="fac-st-wait-called"><i class="fas fa-bell"></i></span>' : ''}
          </div>`;
        }).join('');
        waitHtml = `<div class="fac-st-wait-section">
          <div class="fac-st-wait-title"><i class="fas fa-list-ol"></i> 대기 ${facWaits.length}명</div>
          ${waitItems}
        </div>`;
      }

      const usageRate = totalSlots > 0 ? Math.round((usedCount / totalSlots) * 100) : 0;
      const statusClass = usedCount === 0 ? 'free' : (usedCount >= totalSlots ? 'full' : 'partial');

      html += `<div class="fac-st-card ${statusClass}">
        <div class="fac-st-header">
          <span class="fac-st-icon">${config.icon}</span>
          <span class="fac-st-name">${facName}</span>
          <span class="fac-st-badge ${statusClass}">${usedCount}/${totalSlots}</span>
        </div>
        <div class="fac-st-bar-wrap">
          <div class="fac-st-bar-fill" style="width:${usageRate}%"></div>
        </div>
        <div class="fac-st-subs">${subsHtml}</div>
        ${waitHtml}
      </div>`;
    });

    grid.innerHTML = html || '<p style="color:var(--text-muted);text-align:center;padding:20px;">시설 정보 없음</p>';
  } catch (e) {
    console.error('[DEBUG] loadFacilityStatus 에러:', e);
    grid.innerHTML = `<p style="color:var(--accent-pink);text-align:center;padding:20px;">시설 현황 로딩 실패<br><span style="font-size:0.8rem;color:#9CA3AF;">${e.message || ''}</span></p>`;
  }
}

// ======================================================================
// ===== ★ 관리자 예약 현황 패널 (v11 — 댄스연습실/멀티룸 시간표 그리드) =====
// ======================================================================
async function loadAdminReserves() {
  const panel = document.getElementById('admin-reserve-panel');
  const listEl = document.getElementById('admin-reserve-list');
  if (!panel || !listEl) return;
  panel.style.display = 'block';

  try {
    const today = Util.todayStr();
    const adminPhone = AdminAuth.ADMIN_PHONE;
    // ★ egress 최적화: 오늘 + 관리자 번호만 서버사이드 필터
    const reserves = await API.list('facility_reservations', { date: `eq.${today}`, phone: `eq.${adminPhone}` });

    // 오늘의 모든 관리자 예약 (종료된 것 포함하여 시간표에 표시)
    const todayAdminAll = reserves;

    // 요일별 시간대 계산 — ★ 관리자 현황판은 일/월에도 시간표 표시
    const kst = Util.nowKST();
    const dayOfWeek = kst.getDay(); // 0=일,1=월,...6=토
    const dayNames = ['일','월','화','수','목','금','토'];
    const isWeekend = dayOfWeek === 6;
    const isSunMon = dayOfWeek === 0 || dayOfWeek === 1;
    // 일/월: 관리자 전용 10-20시, 토: 10-18시, 화~금: 10-20시
    const endHour = isWeekend ? 18 : 20;
    const currentHour = kst.getHours();

    // 시간대 슬롯 생성
    const slots = [];
    for (let h = 10; h < endHour; h++) {
      slots.push({ hour: h, label: `${h}:00~${h + 1}:00`, detail: `${h}:00 ~ ${h + 1}:00` });
    }

    const adminFacilities = ['댄스연습실', '멀티룸'];
    let html = '';

    {
      const dayInfo = isSunMon
        ? `오늘: ${dayNames[dayOfWeek]}요일 (관리자 전용 10:00~20:00)`
        : `오늘: ${dayNames[dayOfWeek]}요일 (${isWeekend ? '10:00~18:00' : '10:00~20:00'})`;
      html += `<div class="admin-rsv-day-info"><i class="fas fa-calendar-day"></i> ${dayInfo}</div>`;
      if (isSunMon) {
        html += `<div class="admin-rsv-day-info" style="background:#FFF0F0;border-color:#FFCDD2;color:#E53935;"><i class="fas fa-user-shield"></i> 일/월요일 — 관리자만 예약 가능합니다</div>`;
      }

      adminFacilities.forEach(facName => {
        const config = FacilityConfig.facilities[facName] || {};
        const icon = config.icon || '📍';
        const facReserves = todayAdminAll.filter(r => r.facility === facName);

        const slotsHtml = slots.map(slot => {
          // ★ 12:00~13:00 점심시간 — 예약 불가
          const isLunch = slot.hour === 12;
          if (isLunch) {
            return `<div class="arsv-slot lunch">
              <div class="arsv-slot-time">${slot.label}</div>
              <div class="arsv-slot-info"><i class="fas fa-utensils"></i> 점심시간</div>
            </div>`;
          }

          // ★ 활성(exit_time 비어있는) 예약만 찾기 — 취소/종료된 예약은 무시하여 재예약 가능
          const reserved = facReserves.find(r => r.detail === slot.detail && isExitEmpty(r.exit_time));
          const isPast = slot.hour < currentHour;

          if (reserved) {
            const rsvName = reserved.name || '관리자';
            const noteInfo = reserved.note || '';
            const displayInfo = noteInfo || rsvName;

            return `<div class="arsv-slot booked" data-id="${reserved.id}">
              <div class="arsv-slot-time">${slot.label}</div>
              <div class="arsv-slot-info">${escapeHtml(displayInfo)}</div>
              <div class="arsv-slot-actions">
                <button class="arsv-edit-btn" onclick="event.stopPropagation(); editAdminReserveNote('${reserved.id}', '${escapeHtml(facName)}', '${escapeHtml(slot.label)}')" title="예약자명/인원 수정"><i class="fas fa-pen"></i></button>
                <button class="arsv-cancel-btn" onclick="event.stopPropagation(); cancelAdminReserve('${reserved.id}', '${escapeHtml(facName)}', '${escapeHtml(slot.label)}')" title="예약 취소"><i class="fas fa-times-circle"></i></button>
              </div>
            </div>`;
          } else {
            // 빈 슬롯 (종료된 예약 포함 — 재예약 가능)
            const pastClass = isPast ? ' past' : '';
            return `<div class="arsv-slot empty${pastClass}" onclick="${isPast ? '' : `adminQuickReserve('${escapeHtml(facName)}','${slot.detail}')`}">
              <div class="arsv-slot-time">${slot.label}</div>
              <div class="arsv-slot-info">${isPast ? '-' : '<i class="fas fa-plus"></i> 예약'}</div>
            </div>`;
          }
        }).join('');

        const bookedCount = facReserves.filter(r => isExitEmpty(r.exit_time)).length;

        html += `<div class="arsv-facility">
          <div class="arsv-fac-header">
            <span class="arsv-fac-icon">${icon}</span>
            <span class="arsv-fac-name">${facName}</span>
            <span class="arsv-fac-count">${bookedCount}건 예약중</span>
          </div>
          <div class="arsv-slots-grid">${slotsHtml}</div>
        </div>`;
      });
    }

    listEl.innerHTML = html;
  } catch (e) {
    console.error('[DEBUG] loadAdminReserves 에러:', e);
    listEl.innerHTML = `<div class="admin-rsv-empty"><i class="fas fa-exclamation-circle"></i> 관리자 예약 로딩 실패<br><span style="font-size:0.8rem;color:#9CA3AF;">${e.message || ''}</span></div>`;
  }
}

// ★ 관리자 빠른 예약 (시간표 빈 슬롯 클릭)
async function adminQuickReserve(facility, slotDetail) {
  // ★ 12:00~13:00 점심시간 예약 차단
  const slotHour = parseInt(slotDetail.split(':')[0]);
  if (slotHour === 12) {
    return Swal.fire({ title: '🍚 점심시간', text: '12:00~13:00은 점심시간으로 예약할 수 없습니다.', icon: 'info', confirmButtonColor: '#FF9800' });
  }

  const { value: formData } = await Swal.fire({
    title: `${facility} 예약`,
    html: `
      <p style="margin-bottom:12px;color:#6B7280;font-size:0.9rem;"><strong>${slotDetail}</strong></p>
      <div style="display:flex;flex-direction:column;gap:10px;text-align:left;">
        <div>
          <label style="font-size:0.82rem;font-weight:700;color:#6B7280;display:block;margin-bottom:4px;">예약자명 / 인원</label>
          <input id="arsv-note" type="text" class="swal2-input" style="margin:0;width:100%;" placeholder="예: 홍길동 외 3명">
        </div>
      </div>
    `,
    confirmButtonText: '<i class="fas fa-check"></i> 예약',
    cancelButtonText: '취소',
    confirmButtonColor: '#FF9800',
    showCancelButton: true,
    preConfirm: () => {
      const note = (document.getElementById('arsv-note').value || '').trim();
      return { note };
    }
  });
  if (!formData) return;

  Util.showLoading(true);
  try {
    // ★ note를 reserveFacility에 직접 전달 (2단계 프로세스 제거)
    const res = await Service.reserveFacility(AdminAuth.ADMIN_PHONE, AdminAuth.ADMIN_NAME, facility, slotDetail, formData.note);
    Util.showLoading(false);
    if (res.status === 'success') {
      Swal.fire({ title: '예약 완료! ✅', text: res.message, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
      loadData();
    } else {
      Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
  } catch (e) {
    Util.showLoading(false);
    console.error('[DEBUG] adminQuickReserve 예약 실패:', e);
    Swal.fire({ title: '오류', text: '예약에 실패했습니다: ' + (e.message || '알 수 없는 오류'), icon: 'error', confirmButtonColor: '#4F7BF7' });
  }
}

// ★ 관리자 예약 메모(예약자명/인원) 편집
async function editAdminReserveNote(reservationId, facility, slotLabel) {
  const r = await API.get('facility_reservations', reservationId);
  if (!r) return;

  const { value: newNote } = await Swal.fire({
    title: `📝 예약 메모 편집`,
    html: `<p style="color:#6B7280;font-size:0.9rem;margin-bottom:8px;">${facility} ${slotLabel}</p>`,
    input: 'text',
    inputValue: r.note || '',
    inputPlaceholder: '예약자명, 인원수, 용도 등',
    confirmButtonText: '<i class="fas fa-save"></i> 저장',
    cancelButtonText: '취소',
    confirmButtonColor: '#FF9800',
    showCancelButton: true
  });
  if (newNote === undefined) return;

  Util.showLoading(true);
  try {
    await API.update('facility_reservations', reservationId, { note: newNote });
    Util.showLoading(false);
    Swal.fire({ title: '저장 완료! ✅', icon: 'success', timer: 1000, showConfirmButton: false });
    loadData();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '저장에 실패했습니다.', icon: 'error' });
  }
}

// ★ 관리자 예약 취소 (예약 레코드 삭제 → 빈 슬롯으로 복원, 재예약 가능)
async function cancelAdminReserve(reservationId, facility, slotLabel) {
  const r = await Swal.fire({
    title: `${facility} 예약 취소`,
    html: `<p><strong>${slotLabel}</strong> 예약을 취소하시겠습니까?</p><p style="font-size:0.82rem;color:#9CA3AF;">취소하면 해당 시간대가 빈 슬롯이 되어<br>다른 예약이 가능합니다.</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '<i class="fas fa-trash-alt"></i> 예약 취소',
    cancelButtonText: '돌아가기',
    confirmButtonColor: '#EF4444'
  });
  if (!r.isConfirmed) return;

  Util.showLoading(true);
  try {
    await API.remove('facility_reservations', reservationId);
    Util.showLoading(false);
    Swal.fire({ title: '취소 완료! ✅', text: '예약이 취소되었습니다.', icon: 'success', timer: 1500, showConfirmButton: false });
    loadData();
  } catch (e) {
    Util.showLoading(false);
    Swal.fire({ title: '오류', text: '예약 취소에 실패했습니다.', icon: 'error' });
  }
}

// ======================================================================
// ===== ★ 관리자 시설 직접 추가 (단체 등 대응) =====
// ======================================================================
async function adminAddFacility(rawPhone, displayName) {
  // 시설 목록 생성 — ★ 댄스연습실/멀티룸(adminOnly)은 관리자 예약 현황에서 관리하므로 제외
  const facNames = Object.keys(FacilityConfig.facilities).filter(f => !FacilityConfig.facilities[f].adminOnly);
  const facBtnsHtml = facNames.map(f => {
    const cfg = FacilityConfig.facilities[f];
    return `<button type="button" class="swal-fac-btn" data-fac="${f}" onclick="document.querySelectorAll('.swal-fac-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.getElementById('admin-add-fac-selected').value='${f}';adminUpdateSubOptions('${f}');">${cfg.icon} ${f}</button>`;
  }).join('');

  const r = await Swal.fire({
    title: `🏠 시설 추가`,
    html: `
      <p style="margin-bottom:12px;color:#6B7280;font-size:0.9rem;"><strong>${displayName}</strong>님에게 시설을 배정합니다.</p>
      <input type="hidden" id="admin-add-fac-selected" value="">
      <div class="swal-fac-grid">${facBtnsHtml}</div>
      <div id="admin-sub-options" style="margin-top:12px;"></div>
      <input type="hidden" id="admin-add-sub-selected" value="">
    `,
    confirmButtonText: '<i class="fas fa-check"></i> 배정',
    cancelButtonText: '취소',
    confirmButtonColor: '#4F7BF7',
    showCancelButton: true,
    preConfirm: () => {
      const fac = document.getElementById('admin-add-fac-selected').value;
      if (!fac) { Swal.showValidationMessage('시설을 선택해주세요'); return false; }
      const sub = document.getElementById('admin-add-sub-selected').value || '';
      return { facility: fac, detail: sub };
    }
  });

  if (!r.isConfirmed || !r.value) return;

  Util.showLoading(true);
  try {
    const res = await Service.reserveFacility(rawPhone, displayName.replace(/👥\s*/g, ''), r.value.facility, r.value.detail);
    Util.showLoading(false);
    if (res.status === 'success') {
      Swal.fire({ title: '배정 완료! ✅', text: res.message, icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7' });
      loadData();
    } else {
      Swal.fire({ title: '알림', text: res.message, icon: 'warning', confirmButtonColor: '#4F7BF7' });
    }
  } catch (e) {
    Util.showLoading(false);
    console.error('시설 배정 실패:', e);
    Swal.fire({ title: '오류', text: '시설 배정에 실패했습니다.', icon: 'error' });
  }
}

// 하위 옵션(방/시간대) 동적 생성
function adminUpdateSubOptions(facName) {
  const container = document.getElementById('admin-sub-options');
  const subInput = document.getElementById('admin-add-sub-selected');
  if (!container || !subInput) return;
  subInput.value = '';

  const config = FacilityConfig.facilities[facName];
  if (!config) { container.innerHTML = ''; return; }

  if (config.type === 'timeslot') {
    // 시간대 선택 — ★ 관리자 현황판이므로 일/월에도 슬롯 표시 (forceOpen=true)
    const tsInfo = FacilityConfig.getAdminTimeSlots(true);
    const slots = tsInfo.slots;
    container.innerHTML = `<p style="font-size:0.8rem;color:#6B7280;margin-bottom:6px;">시간대 선택:</p>
      <div class="swal-sub-grid">${slots.map(s =>
        `<button type="button" class="swal-sub-btn" onclick="document.querySelectorAll('.swal-sub-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.getElementById('admin-add-sub-selected').value='${s}';">${s}</button>`
      ).join('')}</div>`;
  } else if (Array.isArray(config.subs) && config.subs.length > 0) {
    // 방/기기 선택
    container.innerHTML = `<p style="font-size:0.8rem;color:#6B7280;margin-bottom:6px;">세부 선택:</p>
      <div class="swal-sub-grid">${config.subs.map(s =>
        `<button type="button" class="swal-sub-btn" onclick="document.querySelectorAll('.swal-sub-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');document.getElementById('admin-add-sub-selected').value='${s}';">${config.icon} ${s}</button>`
      ).join('')}</div>`;
  } else {
    container.innerHTML = '';
  }
}

// ======================================================================
// ===== ★ 보정 수정 내역(히스토리) 확인 =====
// ======================================================================
async function openAdjHistory() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;
  Util.showLoading(true);
  try {
    const history = await Service.getAdjHistory(m);
    Util.showLoading(false);

    if (!history || history.length === 0) {
      Swal.fire({ title: '📋 보정 내역', html: '<p style="color:#6B7280;">해당 월의 보정 내역이 없습니다.</p>', icon: 'info', confirmButtonColor: '#4F7BF7' });
      return;
    }

    const fieldLabels = { m_ele: '남초', f_ele: '여초', m_mid: '남중', f_mid: '여중', m_high: '남고', f_high: '여고', m_youth: '남후청', f_youth: '여후청', m_adult: '남성인', f_adult: '여성인', group_total: '단체' };

    const rowsHtml = history.map(h => {
      const dateObj = new Date(h.date);
      const dayNum = parseInt(h.date.slice(8, 10));
      const dow = ['일','월','화','수','목','금','토'][dateObj.getDay()];
      const timeStr = h.created_at ? new Date(h.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
      const action = h.action === 'clear' ? '<span style="color:#EF4444;">초기화</span>' : '<span style="color:#4F7BF7;">수정</span>';

      let detailHtml = '';
      if (h.action !== 'clear') {
        try {
          const adjData = typeof h.adj_data === 'string' ? JSON.parse(h.adj_data) : (h.adj_data || {});
          const changes = [];
          for (const [k, v] of Object.entries(adjData)) {
            if (parseInt(v) !== 0) {
              const sign = v > 0 ? '+' : '';
              changes.push(`${fieldLabels[k] || k} ${sign}${v}`);
            }
          }
          detailHtml = changes.length > 0 ? changes.join(', ') : '값 없음';
        } catch { detailHtml = '-'; }
      } else {
        detailHtml = '모든 보정값 삭제';
      }

      const memoHtml = h.memo ? `<div class="adj-hist-memo">💬 ${escapeHtml(h.memo)}</div>` : '';

      return `<div class="adj-hist-row">
        <div class="adj-hist-header">
          <span class="adj-hist-date">${dayNum}일(${dow})</span>
          ${action}
          <span class="adj-hist-time">${timeStr}</span>
        </div>
        <div class="adj-hist-detail">${detailHtml}</div>
        ${memoHtml}
      </div>`;
    }).join('');

    await Swal.fire({
      title: `📋 ${parseInt(m.slice(5,7))}월 보정 내역`,
      html: `<div class="adj-hist-list">${rowsHtml}</div>`,
      confirmButtonText: '확인',
      confirmButtonColor: '#4F7BF7',
      width: 520
    });
  } catch (e) {
    Util.showLoading(false);
    console.error('보정 내역 조회 실패:', e);
    Swal.fire({ title: '오류', text: '내역 조회에 실패했습니다.', icon: 'error' });
  }
}

// ======================================================================
// ===== ★ 수동 일별 데이터 입력 (지난 달도 추가 입력 가능) =====
// ======================================================================
async function openManualDayInput() {
  const m = document.getElementById('stats-month').value;
  if (!m) return;

  const year = parseInt(m.slice(0, 4));
  const month = parseInt(m.slice(5, 7));
  const daysInMonth = new Date(year, month, 0).getDate();

  // 이미 데이터가 있는 날짜 확인
  const existingRows = await Service.getDailyBreakdownWithAdj(m);
  const existingDates = new Set(existingRows.map(r => r.date));

  // 날짜 옵션 생성 (전체 날짜)
  let dateOptions = '';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${m}-${String(d).padStart(2, '0')}`;
    const dow = ['일','월','화','수','목','금','토'][new Date(dateStr).getDay()];
    const hasData = existingDates.has(dateStr);
    dateOptions += `<option value="${dateStr}">${d}일(${dow})${hasData ? ' ✓' : ''}</option>`;
  }

  const fields = [
    { key: 'm_ele', label: '남초', icon: '👦' },
    { key: 'f_ele', label: '여초', icon: '👧' },
    { key: 'm_mid', label: '남중', icon: '👦' },
    { key: 'f_mid', label: '여중', icon: '👧' },
    { key: 'm_high', label: '남고', icon: '👦' },
    { key: 'f_high', label: '여고', icon: '👧' },
    { key: 'm_youth', label: '남후청', icon: '🧑' },
    { key: 'f_youth', label: '여후청', icon: '👩' },
    { key: 'm_adult', label: '남성인', icon: '🧑' },
    { key: 'f_adult', label: '여성인', icon: '👩' },
    { key: 'group_total', label: '단체', icon: '👥' }
  ];

  const inputsHtml = fields.map(f =>
    `<div style="display:flex;align-items:center;justify-content:space-between;padding:3px 0;">
      <label style="font-size:0.82rem;font-weight:600;min-width:65px;">${f.icon} ${f.label}</label>
      <input type="number" id="manual-${f.key}" min="0" value="0"
        style="width:75px;text-align:center;padding:5px;border:1px solid #E5E7EB;border-radius:6px;font-size:0.88rem;font-weight:700;" onclick="this.select()">
    </div>`
  ).join('');

  const r = await Swal.fire({
    title: `📝 ${month}월 수동 입력`,
    html: `
      <p style="font-size:0.82rem;color:#6B7280;margin-bottom:10px;">
        날짜를 선택하고 인원수를 입력하세요.<br>
        <span style="color:#F59E0B;font-weight:700;">✓ 표시</span>는 이미 데이터가 있는 날짜입니다.<br>
        기존 데이터가 있으면 <b>보정값</b>으로 추가됩니다.
      </p>
      <div style="margin-bottom:12px;">
        <select id="manual-date" style="width:100%;padding:10px;border:2px solid var(--primary);border-radius:8px;font-size:0.95rem;font-weight:700;color:var(--secondary);">
          ${dateOptions}
        </select>
      </div>
      <div style="max-height:280px;overflow-y:auto;padding:4px;">
        ${inputsHtml}
      </div>
    `,
    confirmButtonText: '<i class="fas fa-save"></i> 저장',
    cancelButtonText: '취소',
    confirmButtonColor: '#FF9800',
    showCancelButton: true,
    width: 400,
    preConfirm: () => {
      const dateStr = document.getElementById('manual-date').value;
      const data = {};
      let hasValue = false;
      fields.forEach(f => {
        const v = parseInt(document.getElementById(`manual-${f.key}`).value, 10) || 0;
        if (v > 0) { data[f.key] = v; hasValue = true; }
      });
      if (!hasValue) {
        Swal.showValidationMessage('최소 1개 항목에 값을 입력해주세요');
        return false;
      }
      return { date: dateStr, data };
    }
  });

  if (!r.isConfirmed || !r.value) return;

  const { date: targetDate, data } = r.value;

  Util.showLoading(true);
  try {
    // 기존 데이터가 있는 날짜 → 보정값(adj)으로 저장
    if (existingDates.has(targetDate)) {
      const existingAdj = await Service.getStatsAdj(targetDate);
      const mergedAdj = { ...existingAdj };
      for (const [k, v] of Object.entries(data)) {
        mergedAdj[k] = (parseInt(mergedAdj[k], 10) || 0) + v;
      }
      await Service.setStatsAdj(targetDate, mergedAdj, '수동 입력 (추가)');
      Util.showLoading(false);
      await Swal.fire({
        title: '추가 완료! ✅',
        text: `${targetDate} 보정값으로 추가되었습니다.`,
        icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7'
      });
    } else {
      // 데이터 없는 날짜 → 보정값으로 새로 생성
      await Service.setStatsAdj(targetDate, data, '수동 입력 (신규)');
      Util.showLoading(false);
      await Swal.fire({
        title: '입력 완료! ✅',
        text: `${targetDate} 데이터가 입력되었습니다.`,
        icon: 'success', timer: 1500, confirmButtonColor: '#4F7BF7'
      });
    }
    onStatsMonthChange();
  } catch (e) {
    Util.showLoading(false);
    console.error('수동 입력 실패:', e);
    Swal.fire({ title: '오류', text: '저장에 실패했습니다.', icon: 'error' });
  }
}
