-- ============================================================
-- 오정센터 청소년카페 — members 테이블 접근 잠금 마이그레이션
-- Supabase 대시보드 → SQL Editor 에서 전체 실행
--
-- 목적: anon(공개) 키로 members 테이블을 직접 통째로 조회/수정하지
-- 못하게 막고, 꼭 필요한 동작만 "함수(RPC)"를 통해서만 허용합니다.
--   - 키오스크/모바일: 전화번호 하나로 본인 조회 / 신규 가입만 가능
--   - 관리자(members.html): 비밀번호를 맞춰야만 전체 조회/검색/수정/삭제 가능
--     (비밀번호 확인이 브라우저가 아니라 이 서버 함수 안에서 이루어짐)
--
-- ⚠️ 관리자 비밀번호를 바꾸고 싶으면 아래 'admin1388!' 부분을
--    전부 새 비밀번호로 바꾼 뒤 실행하세요 (현재 화면 비밀번호와 동일하게 맞춰둠).
-- ============================================================

-- 1) anon 키의 members 테이블 직접 접근 권한 제거 (핵심 조치)
REVOKE SELECT, INSERT, UPDATE, DELETE ON members FROM anon;

-- 2) 키오스크/모바일용 — 전화번호 단건 조회 (본인 확인용, 비밀번호 불필요)
CREATE OR REPLACE FUNCTION public.lookup_member_by_phone(p_phone text)
RETURNS SETOF members
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM members WHERE phone = p_phone LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_member_by_phone(text) TO anon;

-- 3) 여러 전화번호 배치 조회 (관리자 현황판이 "오늘 활성 이용자"만 조회할 때 사용 — 본인들 것만)
CREATE OR REPLACE FUNCTION public.lookup_members_by_phones(p_phones text[])
RETURNS SETOF members
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM members WHERE phone = ANY(p_phones);
$$;
GRANT EXECUTE ON FUNCTION public.lookup_members_by_phones(text[]) TO anon;

-- 4) 이름으로 조회 (모바일 로그인 — 이름+뒷4자리)
CREATE OR REPLACE FUNCTION public.lookup_members_by_name(p_name text)
RETURNS SETOF members
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM members WHERE name = p_name;
$$;
GRANT EXECUTE ON FUNCTION public.lookup_members_by_name(text) TO anon;

-- 5) 신규 회원 가입 (키오스크 회원가입, 비밀번호 불필요 — 원래 공개 동작)
CREATE OR REPLACE FUNCTION public.register_member(
  p_phone text, p_name text, p_birthdate date, p_gender text,
  p_reg_type text DEFAULT '개인', p_member_code text DEFAULT ''
)
RETURNS SETOF members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  INSERT INTO members (phone, name, birthdate, gender, reg_type, member_code, registered_at)
  VALUES (p_phone, p_name, p_birthdate, p_gender, p_reg_type, p_member_code, (extract(epoch from now()) * 1000)::bigint)
  RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_member(text, text, date, text, text, text) TO anon;

-- 6) ★ 관리자 전용 — 비밀번호 확인 후 전체 회원 목록
CREATE OR REPLACE FUNCTION public.admin_list_members(p_password text)
RETURNS SETOF members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_password IS DISTINCT FROM 'admin1388!' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY SELECT * FROM members ORDER BY registered_at DESC;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_list_members(text) TO anon;

-- 7) ★ 관리자 전용 — 비밀번호 확인 후 회원 정보 수정
CREATE OR REPLACE FUNCTION public.admin_update_member(
  p_password text, p_id bigint, p_name text, p_phone text,
  p_birthdate date, p_gender text
)
RETURNS SETOF members
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_password IS DISTINCT FROM 'admin1388!' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  RETURN QUERY
  UPDATE members SET name = p_name, phone = p_phone, birthdate = p_birthdate, gender = p_gender
  WHERE id = p_id
  RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_update_member(text, bigint, text, text, date, text) TO anon;

-- 8) ★ 관리자 전용 — 비밀번호 확인 후 회원 삭제
CREATE OR REPLACE FUNCTION public.admin_delete_member(p_password text, p_id bigint)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_password IS DISTINCT FROM 'admin1388!' THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000';
  END IF;
  DELETE FROM members WHERE id = p_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.admin_delete_member(text, bigint) TO anon;

-- ============================================================
-- 실행 후 확인용 (선택): 직접 테이블 접근이 막혔는지 테스트
-- 아래 SELECT는 이제 "permission denied" 에러가 나와야 정상입니다.
-- select * from members limit 1;
-- ============================================================
