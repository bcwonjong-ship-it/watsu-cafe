/**
 * Google Sheets 연동 모듈 v2
 * 스프레드시트 ID: 1dq_0vq7P-5g-Me6mt0NsUL15aXcCFzGAVgfcuF-kvM0
 * 
 * 시트 구조:
 * 1. 명단(개인): 고유ID | 이름 | 연락처 | 생년월일 | 성별 | 가입일 | 입장여부(T/F)
 * 2. 명단(단체): 고유ID(Key) | 대표자이름 | 대표번호(H) | 단체명 | 연령대별인원 | 개인정보동의(T/F) | 가입일 | 현재상태
 * 3. 입퇴장 기록: 날짜 | 방문자ID | 이름/단체명 | 구분(개인/단체) | 입장시간 | 퇴장시간 | 비고
 * 4. 시설예약 현황: 시설명 | 이용자ID | 이름 | 시작시간 | 종료예정(30분 뒤) | 남은시간 | 상태(이용중/비어있음)
 * 5. 누적 이용 기록: 날짜 | 이름 | 고유ID | 구분(입장/시설명) | 이용시간(분)
 */

const SHEET_ID = '1dq_0vq7P-5g-Me6mt0NsUL15aXcCFzGAVgfcuF-kvM0';

const GSheets = {
  // 시트별 GID 매핑
  sheets: {
    '명단(개인)': 0,
    '명단(단체)': null,
    '입퇴장 기록': null,
    '시설예약 현황': null,
    '누적 이용 기록': null
  },

  // CSV 읽기 URL
  getCsvUrl(sheetName) {
    const gid = this.sheets[sheetName];
    if (gid === null || gid === undefined) {
      return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheetName)}`;
    }
    return `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${gid}`;
  },

  // Google Visualization API JSON 파싱
  parseGvizResponse(text) {
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*)\);?/);
    if (!match) return [];
    const json = JSON.parse(match[1]);
    const cols = json.table.cols.map(c => c.label || '');
    const rows = [];
    for (const row of (json.table.rows || [])) {
      const obj = {};
      row.c.forEach((cell, i) => {
        if (cols[i]) {
          obj[cols[i]] = cell ? (cell.v !== null && cell.v !== undefined ? String(cell.v) : '') : '';
        }
      });
      rows.push(obj);
    }
    return rows;
  },

  // 시트 데이터 읽기
  async readSheet(sheetName) {
    try {
      const url = this.getCsvUrl(sheetName);
      const res = await fetch(url);
      if (!res.ok) { console.warn(`Google Sheets 읽기 실패: ${sheetName}`); return null; }
      const text = await res.text();
      return this.parseGvizResponse(text);
    } catch (e) {
      console.warn(`Google Sheets 연결 실패 (${sheetName}):`, e.message);
      return null;
    }
  },

  // ===== 로컬 DB → Google Sheets 형식 변환 =====

  formatMembersForSheet(members) {
    return members.map(m => ({
      '고유ID': m.id || '',
      '이름': m.name || '',
      '연락처': Util.formatPhone(m.phone) || '',
      '생년월일': m.birthdate || '',
      '성별': m.gender || '',
      '가입일': m.registered_at ? new Date(m.registered_at).toLocaleDateString('ko-KR') : '',
      '입장여부(T/F)': ''
    }));
  },

  formatGroupsForSheet(groups) {
    return groups.map(g => ({
      '고유ID(Key)': g.id || '',
      '대표자이름': g.name || '',
      '대표번호(H)': Util.formatPhone(g.phone) || '',
      '단체명': g.group_name || '',
      '연령대별인원': g.group_detail || '',
      '개인정보동의(T/F)': 'T',
      '가입일': g.registered_at ? new Date(g.registered_at).toLocaleDateString('ko-KR') : '',
      '현재상태': ''
    }));
  },

  formatAccessLogsForSheet(logs) {
    return logs.map(l => ({
      '날짜': l.date || '',
      '방문자ID': l.phone || '',
      '이름/단체명': l.name || '',
      '구분(개인/단체)': (l.note || '').includes('단체') ? '단체' : '개인',
      '입장시간': l.entry_time || '',
      '퇴장시간': l.exit_time || '',
      '비고': l.note || ''
    }));
  },

  formatReservationsForSheet(reservations) {
    return reservations.map(r => {
      const detail = r.detail && r.detail !== '-' ? `${r.facility} ${r.detail}` : r.facility;
      let endTime = '', remain = '';
      let status = isExitEmpty(r.exit_time) ? '이용중' : '비어있음';
      if (r.time_limit > 0 && r.entry_time && isExitEmpty(r.exit_time)) {
        const [h, m] = r.entry_time.split(':').map(Number);
        const totalMin = r.time_limit;
        const endH = h + Math.floor((m + totalMin) / 60);
        const endM = (m + totalMin) % 60;
        endTime = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;
        const elapsed = Util.getElapsedMinutes(r.entry_time);
        const left = totalMin - elapsed;
        remain = left > 0 ? `${left}분` : `${Math.abs(left)}분 초과`;
      }
      return {
        '시설명': detail,
        '이용자ID': r.phone || '',
        '이름': r.name || '',
        '시작시간': r.entry_time || '',
        '종료예정(30분 뒤)': endTime,
        '남은시간': remain,
        '상태(이용중/비어있음)': status
      };
    });
  },

  formatDailyVisitorsForSheet(visitors) {
    return visitors.map(v => ({
      '날짜': v.date || '',
      '이름': v.name || '',
      '고유ID': v.phone || '',
      '구분(입장/시설명)': v.note || '입장',
      '이용시간(분)': v.usage_minutes || ''
    }));
  },

  // CSV 내보내기 (다운로드)
  exportToCSV(data, filename) {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(','),
      ...data.map(row => headers.map(h => {
        const val = String(row[h] || '').replace(/"/g, '""');
        return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
      }).join(','))
    ].join('\n');

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
};
