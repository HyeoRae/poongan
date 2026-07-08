-- =============================================================
-- 🛎️ 대기실 → 활동 런처. 0019(event_lobby) 실행 후 이 파일을 실행하세요.
--
-- 대기실을 "모으기"뿐 아니라 "다음 활동 고르기"의 진입점으로 확장한다.
-- 팀 배정식·벌칙은 각자 오버레이(draw_state/penalty_state)라 대기실만 닫으면
-- 자연스럽게 화면을 덮지만, 퀴즈쇼는 별도 페이지(/quiz)라 "이동 신호"가 필요하다.
-- 그래서 event_lobby 에 activity 컬럼을 두고, 관리자가 대기실에서 '퀴즈쇼'를
-- 누르면 activity='quiz' 가 전원에게 realtime 으로 퍼져 각자 /quiz 로 이동한다.
-- =============================================================

-- 다음 활동 신호: null=대기 / 'quiz'=퀴즈 페이지로 이동
-- (팀 배정식·벌칙은 자체 오버레이라 여기 값이 필요 없음 — 대기실을 닫기만 하면 됨)
alter table public.event_lobby
  add column if not exists activity text check (activity in ('quiz'));

-- 대기실 열기 — 새로 열 때는 이전 activity 신호를 반드시 초기화(재사용 안전).
create or replace function public.open_event_lobby(p_title text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  update public.event_lobby
    set status = 'open',
        title = nullif(btrim(coalesce(p_title, '')), ''),
        activity = null,
        updated_at = now()
    where id = 1;
end;
$$;

-- 대기실에서 다음 활동 지정(관리자 전용). 지금은 'quiz' 만 신호가 필요.
-- 상태는 'open' 그대로 두고 activity 만 켠다 → 각 클라이언트가 /quiz 로 이동하며
-- 이동 후 대기실 오버레이는 스스로 숨는다(EventLobby 에서 처리).
create or replace function public.set_lobby_activity(p_activity text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;
  if p_activity is not null and p_activity <> 'quiz' then
    raise exception '알 수 없는 활동입니다: %', p_activity;
  end if;
  update public.event_lobby
    set activity = p_activity,
        updated_at = now()
    where id = 1;
end;
$$;

grant execute on function public.set_lobby_activity(text) to authenticated;
