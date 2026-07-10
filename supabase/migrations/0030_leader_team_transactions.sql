-- =============================================================
-- 팀장 능력 확장: 팀원 "거래내역"을 팀원 이름과 함께 열람.
-- 0028(비밀역할) 이후에 실행하세요.
--
-- 배경: transactions RLS(read_tx, 0014)는 본인+관리자만 열람을 허용하므로
--       팀장은 팀원 거래를 직접 조회할 수 없다. 또한 기존 잔고 조회
--       leader_team_balances()는 "지금 잔액"만 보여줘 누가 언제 벌고 잃었는지
--       흐름을 알 수 없었다. 이 함수는 팀원별 이름이 붙은 거래 타임라인을
--       정의자권한(security definer)으로 반환한다.
--
--  · leader_team_transactions(p_limit) — 팀장 소속 팀원(실참가자)의 거래 원장을
--    최신순으로 반환. 각 행에 어떤 팀원(uid·name)의 거래인지 라벨을 포함한다.
-- =============================================================

create or replace function public.leader_team_transactions(p_limit int default 60)
returns table (
  id         bigint,
  uid        uuid,
  name       text,
  amount     int,
  type       text,
  reason     text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_role text;
  v_team int;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;

  select role into v_role from public.player_roles where user_id = v_uid;
  if v_role is distinct from 'leader' then
    raise exception '팀장만 사용할 수 있습니다.';
  end if;

  select team_id into v_team from public.profiles where id = v_uid;
  if v_team is null then raise exception '소속 팀이 없습니다.'; end if;

  return query
  select t.id, t.user_id, p.display_name, t.amount, t.type::text, t.reason, t.created_at
  from public.transactions t
  join public.profiles p on p.id = t.user_id
  where p.team_id = v_team and p.role = 'player' and p.is_bot = false
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 200));
end;
$$;
grant execute on function public.leader_team_transactions(int) to authenticated;
