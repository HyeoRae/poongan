# 풍산11기 여름여행 웹앱 🏝️🪙

통영-거제 2박3일 계모임 여행용 웹앱. **풍산토큰(골드)** 경제 + 팀 대항전 + 도박/배신/송금 컨텐츠 +
실시간 대시보드.

- 스택: **Next.js 15 (App Router) · Supabase (PostgreSQL/Auth/Realtime) · Tailwind v4 · Vercel**
- 모바일 우선 UI, ID/PW 로그인(계정은 관리자가 사전 생성), 관리자(기획자 2명) 권한 분리.

---

## 1. Supabase 프로젝트 만들기
1. https://supabase.com → 새 프로젝트 생성 (Region: **Northeast Asia (Seoul)** 권장)
2. **SQL Editor** 에서 아래 순서로 실행:
   - `supabase/migrations/0001_init.sql` (테이블 + RLS + 골드 RPC)
   - `supabase/migrations/0002_gamble.sql` (도박 RPC)
3. **Settings → API** 에서 키 3개 확인:
   - `Project URL`, `anon public` 키, `service_role` 키

## 2. 환경변수 설정
`.env.example` → `.env.local` 복사 후 값 채우기:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # 시드에만 사용, 절대 커밋 금지
NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN=poongsan.app
```

## 3. 계정 시드 (12명 일괄 생성)
1. `supabase/accounts.example.json` → `supabase/accounts.json` 복사
2. 관리자 2명 + 참가자 10명의 **username / password / display_name** 입력
3. 시드 실행:
```bash
npm install
npm run seed
```
→ 12계정 + 팀 2개(통영팀/거제팀) + 샘플 일정이 생성됩니다.
> `accounts.json` 은 `.gitignore` 처리됨. 친구들에겐 username/password만 공유하세요.

## 4. 로컬 실행
```bash
npm run dev
```
http://localhost:3000 → 로그인 → 대시보드.

## 5. 배포 (Vercel)
1. GitHub에 푸시 후 Vercel에서 Import
2. **Environment Variables** 에 위 4개 등록 (`SUPABASE_SERVICE_ROLE_KEY`는 배포엔 불필요하지만 넣어도 무방)
3. Deploy → 모바일에서 접속 확인

---

## 화면 구성
| 경로 | 설명 | 권한 |
|------|------|------|
| `/login` | ID/PW 로그인 | 공개 |
| `/dashboard` | 실시간 팀·멤버 골드 현황 (메인) | 전체 |
| `/schedule` | 2박3일 일정표 | 전체 |
| `/gamble` | 도박장 (동전던지기 2배, 주사위 6배) | 전체 |
| `/wallet` | 내 골드·내역·송금(배신) | 전체 |
| `/admin` | 골드 지급/차감, 팀 빌딩 | 관리자 |

## 골드 경제 규칙
- 모든 골드 변동은 `transactions` 원장에 기록되고, `profiles.gold_balance` 가 원자적으로 갱신됩니다.
- 변동은 전부 Postgres RPC(`_apply_gold` 경유)로만 발생 → 음수 잔액·조작 방지.
- 대시보드/지갑 골드는 Supabase Realtime 으로 즉시 갱신됩니다.

## ⚠️ 운영 주의
- Supabase 무료 프로젝트는 **~1주 미사용 시 일시정지**. 여행 직전 한 번 접속해 깨워두세요(여행 중엔 매일 사용하므로 문제 없음).

---

## 다음 단계 (Phase 2~3 후보)
- 미니게임(퀴즈/룰렛/투표) `games`/`game_plays` 테이블 활용
- 골드 강탈(확률 또는 관리자 승인) 메커니즘
- 상점/경매(`shop_items`/`purchases`) — 여행 중 권한 구매
- PWA(홈화면 추가), 사운드/연출 강화
