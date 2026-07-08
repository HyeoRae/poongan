-- =============================================================
-- 🎭 벌칙 옷 확장: "사람 고정 + 옷 랜덤" 파칭코 모드 + 3시간 착용 타이머
-- 0001~0020 실행 후 이 파일을 SQL Editor에서 실행하세요.
--
-- 기존 벌칙 뽑기(0017)는 "옷 고정 + 사람 랜덤"이었다. 퀴즈로 벌칙 대상(사람)이
-- 이미 정해진 경우, 이번엔 반대로 "그 사람은 고정, 옷을 파칭코로 랜덤" 뽑는다.
-- → penalty_state.mode='outfit' 이면 participants 를 사람이 아닌 "남은 옷 레인"으로
--   채우고(startOutfitPachinko), winner_index=당첨 옷, target_user=옷 입을 사람.
--
-- 또 벌칙 옷은 "하루종일"이 아니라 "당첨 후 3시간"만 입는다.
-- → penalty_picks.expires_at 을 추가하고, confirmPenaltyPick 이 now()+3h 로 채운다.
--   관리자 현황판이 이 값으로 남은시간을 카운트다운한다.
-- =============================================================

-- 착용 만료 시각(당첨 + 3시간). 기존 행은 null(만료 개념 없던 과거 이력).
alter table public.penalty_picks
  add column if not exists expires_at timestamptz;

-- 파칭코 모드: 'person'(기존, 사람 랜덤) | 'outfit'(신규, 옷 랜덤)
alter table public.penalty_state
  add column if not exists mode text not null default 'person'
    check (mode in ('person','outfit'));

-- outfit 모드에서 "옷을 입을 사람"(고정). {user_id, display_name, avatar_url}
alter table public.penalty_state
  add column if not exists target_user jsonb;

-- 현황판 실시간 갱신 위해 penalty_picks 도 publication 에 추가.
do $$
begin
  begin alter publication supabase_realtime add table public.penalty_picks; exception when duplicate_object then null; end;
end $$;
