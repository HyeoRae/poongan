-- =============================================================
-- 팀 배정 초기화(배정 전으로 되돌리기) RPC.
-- 전원 team_id 해제 + 비밀 역할 삭제 + 배정식 상태 idle 리셋.
-- 0001~0012 실행 후 이 파일을 실행하세요.
-- =============================================================

create or replace function public.reset_teams()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception '관리자만 가능합니다.';
  end if;

  -- 모든 참가자 팀 해제
  update public.profiles set team_id = null where role = 'player';

  -- 비밀 역할(스파이) 초기화
  delete from public.player_roles where true;

  -- 배정식 상태를 처음(idle)으로 되돌림 → 접속자 화면의 오버레이/결과 사라짐
  update public.draw_state
    set status = 'idle',
        revealed_count = 0,
        assignments = '[]'::jsonb,
        updated_at = now()
    where id = 1;
end;
$$;
