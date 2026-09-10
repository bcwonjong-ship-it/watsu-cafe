/**
 * 오정센터 청소년카페 - 이용자 관리 v2
 * 회원 조회 / 검색 / 수정 / 삭제
 * ★ v2: ID 전달 data-attribute 방식, 에러 로깅 강화, 비밀번호 잠금
 */

let allMembers = [];
let filteredMembers = [];
let currentFilter = 'all';
let editGender = '';
let searchDebounceTimer = null;
let isAuthenticated = false;
const ADMIN_PIN = 'admin1388!';

// ===== 초기화 =====
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
});

// ===== 비밀번호 인증 =====
// ★ v13: 비밀번호는 이제 서버(Postgres 함수)에서도 다시 검증됨.
// 여기서의 확인은 빠른 UX 피드백용이고, 실제 데이터 접근 차단은 서버 쪽에서 이루어짐.
function checkAuth() {
  // 세션 중 인증 유지 (sessionStorage) — 비밀번호 자체를 저장해 매 요청마다 서버에 함께 전달
  const savedPw = sessionStorage.getItem('members_pw');
  if (savedPw) {
    isAuthenticated = true;
    loadMembers();
    return;
  }
  showAuthPrompt();
}

function getAdminPw() {
  return sessionStorage.getItem('members_pw') || '';
}

function showAuthPrompt() {
  Swal.fire({
    title: '🔒 관리자 인증',
    html: '<p style="margin-bottom:12px;color:#6B7280;">이용자 관리 페이지에 접근하려면<br>비밀번호를 입력해주세요.</p>',
    input: 'password',
    inputPlaceholder: '비밀번호 입력',
    inputAttributes: { autocomplete: 'off', inputmode: 'numeric', maxlength: '10' },
    confirmButtonText: '확인',
    confirmButtonColor: '#4F7BF7',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showCancelButton: true,
    cancelButtonText: '돌아가기',
    preConfirm: (val) => {
      if (val !== ADMIN_PIN) {
        Swal.showValidationMessage('비밀번호가 올바르지 않습니다');
        return false;
      }
      return val; // ★ v13: 실제 비밀번호 문자열을 반환해야 서버 RPC에 전달 가능
    }
  }).then((result) => {
    if (result.isConfirmed) {
      isAuthenticated = true;
      sessionStorage.setItem('members_pw', result.value);
      loadMembers();
    } else {
      // 돌아가기: 이전 페이지 또는 키오스크로
      window.location.href = document.referrer || 'admin.html';
    }
  });
}

// ===== 회원 목록 불러오기 =====
async function loadMembers() {
  if (!isAuthenticated) return;
  Util.showLoading(true);
  try {
    allMembers = await Service.getAllMembers(getAdminPw());
    // 최근 가입순 정렬
    allMembers.sort((a, b) => (b.registered_at || 0) - (a.registered_at || 0));
    applyFilter();
    Util.showLoading(false);
  } catch (e) {
    Util.showLoading(false);
    console.error('회원 로딩 실패:', e);
    // ★ v13: 서버가 비밀번호를 거부(403)하면 세션을 지우고 다시 인증받기
    if (e.status === 403 || e.status === 401) {
      sessionStorage.removeItem('members_pw');
      isAuthenticated = false;
      Swal.fire({ title: '인증 만료', text: '비밀번호를 다시 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' })
        .then(() => showAuthPrompt());
      return;
    }
    document.getElementById('member-list').innerHTML =
      `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>데이터 로딩 실패</p><p style="font-size:0.85rem;color:#9CA3AF;margin-top:8px;">${e.message || '서버 연결을 확인해주세요'}</p></div>`;
  }
}

// ===== 검색 =====
function handleSearch() {
  clearTimeout(searchDebounceTimer);
  const q = document.getElementById('search-input').value.trim();
  document.getElementById('search-clear').style.display = q ? 'flex' : 'none';
  searchDebounceTimer = setTimeout(() => applyFilter(), 200);
}

function clearSearch() {
  document.getElementById('search-input').value = '';
  document.getElementById('search-clear').style.display = 'none';
  applyFilter();
}

// ===== 필터 =====
function setFilter(f) {
  currentFilter = f;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === f);
  });
  applyFilter();
}

function applyFilter() {
  const q = (document.getElementById('search-input').value || '').trim().toLowerCase();
  const qNum = q.replace(/[^0-9]/g, '');

  filteredMembers = allMembers.filter(m => {
    // 검색 필터
    if (q) {
      const nameMatch = (m.name || '').toLowerCase().includes(q);
      const phoneMatch = qNum && Util.cleanPhone(m.phone).includes(qNum);
      if (!nameMatch && !phoneMatch) return false;
    }
    // 연령대 필터
    if (currentFilter !== 'all') {
      const age = Util.getAgeGroup(m.birthdate);
      if (age !== currentFilter) return false;
    }
    return true;
  });

  renderMembers();
}

// ===== 렌더링 (★ data-member-id 속성 방식) =====
function renderMembers() {
  const list = document.getElementById('member-list');
  document.getElementById('member-count').textContent = filteredMembers.length;

  if (filteredMembers.length === 0) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-user-slash"></i><p>해당하는 회원이 없습니다</p></div>';
    return;
  }

  list.innerHTML = filteredMembers.map(m => {
    const ageGroup = Util.getAgeGroup(m.birthdate);
    const genderIcon = m.gender === '남' ? '👦' : (m.gender === '여' ? '👧' : '👤');
    const regDate = m.registered_at
      ? new Date(m.registered_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' })
      : '-';
    const birthDisplay = m.birthdate || '-';

    return `
      <div class="member-card" data-member-id="${m.id}">
        <div class="member-card-top">
          <div class="member-avatar">${genderIcon}</div>
          <div class="member-info">
            <div class="member-name-row">
              <strong>${escapeHtml(m.name)}</strong>
              <span class="age-chip age-${ageGroup}">${ageGroup}</span>
            </div>
            <div class="member-phone"><i class="fas fa-phone-alt"></i> ${Util.formatPhone(m.phone)}</div>
          </div>
          <button class="member-edit-btn" data-edit-id="${m.id}">
            <i class="fas fa-pen"></i>
          </button>
        </div>
        <div class="member-card-bottom">
          <span><i class="fas fa-birthday-cake"></i> ${birthDisplay}</span>
          <span><i class="fas fa-calendar-plus"></i> ${regDate}</span>
        </div>
      </div>`;
  }).join('');

  // ★ Event delegation으로 클릭 처리 (UUID 하이픈 문제 완전 해결)
  list.querySelectorAll('.member-card').forEach(card => {
    card.addEventListener('click', (e) => {
      const mid = card.dataset.memberId;
      if (mid) openEditModal(mid);
    });
  });
  list.querySelectorAll('.member-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mid = btn.dataset.editId;
      if (mid) openEditModal(mid);
    });
  });
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== 수정 모달 (★ 문자열 비교 안전하게) =====
function openEditModal(memberId) {
  const mid = String(memberId);
  const m = allMembers.find(x => String(x.id) === mid);
  if (!m) {
    console.error('회원 못 찾음 — id:', memberId, '타입:', typeof memberId);
    Swal.fire({ title: '오류', text: '회원 정보를 찾을 수 없습니다.', icon: 'error', confirmButtonColor: '#4F7BF7' });
    return;
  }

  document.getElementById('edit-id').value = m.id;
  document.getElementById('edit-name').value = m.name || '';
  document.getElementById('edit-phone').value = Util.formatPhone(m.phone);
  document.getElementById('edit-birth').value = m.birthdate || '';
  editGender = m.gender || '';
  updateEditGenderUI();

  document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  editGender = '';
}

function setEditGender(g) {
  editGender = g;
  updateEditGenderUI();
}

function updateEditGenderUI() {
  document.getElementById('edit-btn-male').classList.toggle('active-male', editGender === '남');
  document.getElementById('edit-btn-female').classList.toggle('active-female', editGender === '여');
}

async function saveEdit() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value.trim();
  const phone = Util.cleanPhone(document.getElementById('edit-phone').value);
  const birthdate = document.getElementById('edit-birth').value;

  if (!name) return Swal.fire({ title: '알림', text: '이름을 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' });
  if (!phone || phone.length < 10) return Swal.fire({ title: '알림', text: '전화번호를 정확히 입력해주세요.', icon: 'warning', confirmButtonColor: '#4F7BF7' });
  if (!id) return Swal.fire({ title: '오류', text: '회원 ID가 없습니다. 모달을 닫고 다시 시도해주세요.', icon: 'error', confirmButtonColor: '#4F7BF7' });

  const updateData = {
    name: name,
    phone: phone,
    birthdate: birthdate || null,
    gender: editGender || null
  };

  console.log('saveEdit 요청:', { id, updateData });

  Util.showLoading(true);
  try {
    const result = await Service.updateMember(id, updateData, getAdminPw());
    console.log('saveEdit 응답:', result);
    Util.showLoading(false);
    closeEditModal();
    await Swal.fire({
      title: '수정 완료! ✅',
      text: '회원 정보가 수정되었습니다.',
      icon: 'success',
      confirmButtonColor: '#4F7BF7',
      timer: 1500,
      timerProgressBar: true
    });
    loadMembers();
  } catch (e) {
    Util.showLoading(false);
    console.error('saveEdit 에러:', e);
    Swal.fire({
      title: '수정 실패',
      html: `<p>회원 정보 수정 중 오류가 발생했습니다.</p><p style="font-size:0.8rem;color:#9CA3AF;margin-top:8px;">${escapeHtml(e.message || '알 수 없는 오류')}</p>`,
      icon: 'error',
      confirmButtonColor: '#4F7BF7'
    });
  }
}

async function deleteMember() {
  const id = document.getElementById('edit-id').value;
  const name = document.getElementById('edit-name').value;

  if (!id) return Swal.fire({ title: '오류', text: '회원 ID가 없습니다.', icon: 'error' });

  const r = await Swal.fire({
    title: '회원 삭제',
    html: `<p><strong>${escapeHtml(name)}</strong>님을 삭제하시겠습니까?</p><p style="color:#FF6B9D;font-size:0.85rem;">⚠️ 이 작업은 되돌릴 수 없습니다.</p>`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: '삭제',
    cancelButtonText: '취소',
    confirmButtonColor: '#FF6B9D'
  });
  if (!r.isConfirmed) return;

  Util.showLoading(true);
  try {
    await Service.deleteMember(id, getAdminPw());
    Util.showLoading(false);
    closeEditModal();
    await Swal.fire({
      title: '삭제 완료',
      text: '회원이 삭제되었습니다.',
      icon: 'success',
      confirmButtonColor: '#4F7BF7',
      timer: 1500,
      timerProgressBar: true
    });
    loadMembers();
  } catch (e) {
    Util.showLoading(false);
    console.error('deleteMember 에러:', e);
    Swal.fire({ title: '오류', text: '삭제 중 오류가 발생했습니다.', icon: 'error' });
  }
}
