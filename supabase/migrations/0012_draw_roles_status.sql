-- =============================================================
-- 팀 배정식에 "역할 카드 배정" 단계 추가.
-- done(팀 공개 완료) 이후 관리자가 버튼을 누르면 status='roles' 로 전환되어
-- 모든 클라이언트가 역할 카드 분배 연출을 시작한다. 0003 실행 후 이 파일을 실행하세요.
-- =============================================================

alter table public.draw_state drop constraint if exists draw_state_status_check;
alter table public.draw_state
  add constraint draw_state_status_check
  check (status in ('idle', 'intro', 'revealing', 'done', 'roles'));
