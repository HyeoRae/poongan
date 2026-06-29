# 풍산11기 여름여행 웹앱 🏝️🪙

통영-거제 2박3일 계모임 여행용 웹앱. **풍산토큰** 경제 + 팀 대항전 + 도박/배신/송금 컨텐츠 +
실시간 대시보드.

- 스택: **Next.js 15 (App Router) · Supabase (PostgreSQL/Auth/Realtime) · Tailwind v4 · Vercel**
- 모바일 우선 UI, ID/PW 로그인(계정은 관리자가 사전 생성), 관리자(기획자 2명) 권한 분리.

---

## 1. Supabase 프로젝트 만들기
1. https://supabase.com → 새 프로젝트 생성 (Region: **Northeast Asia (Seoul)** 권장)
2. **SQL Editor** 에서 `supabase/migrations/` 의 파일을 **번호 순서대로 전부** 실행:
   - `0001_init.sql`(테이블+RLS+RPC), `0002_gamble.sql`(도박), `0003_draw.sql`(배정식),
     `0004_password_change.sql`, `0005_app_settings.sql`(공개토글),
     `0006_token_rename.sql`(명칭), `0007_push_subscriptions.sql`(푸시 구독)
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
| `/dashboard` | 실시간 팀·멤버 풍산토큰 현황 (메인) | 전체 |
| `/schedule` | 2박3일 일정표 | 전체 |
| `/gamble` | 도박장 (동전던지기 2배, 주사위 6배) | 전체 |
| `/wallet` | 내 풍산토큰·내역·송금(배신) | 전체 |
| `/admin` | 풍산토큰 지급/차감, 팀 빌딩 | 관리자 |

## 풍산토큰 경제 규칙
- 모든 풍산토큰 변동은 `transactions` 원장에 기록되고, `profiles.gold_balance` 가 원자적으로 갱신됩니다.
- 변동은 전부 Postgres RPC(`_apply_gold` 경유)로만 발생 → 음수 잔액·조작 방지.
- 대시보드/지갑 풍산토큰는 Supabase Realtime 으로 즉시 갱신됩니다.

## 🔔 푸시 알림 (웹 푸시)
관리자가 `/admin` → "🔔 전체 알림 보내기"로 참가자 폰에 푸시를 보냅니다.

**설정 (1회):**
1. VAPID 키 생성: `npx web-push generate-vapid-keys`
2. `.env.local`(로컬) + **Vercel 환경변수**에 추가:
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT=mailto:너의메일`
3. `0007_push_subscriptions.sql` 실행 + 재배포

**참가자 사용법:**
- 각자 `/dashboard`에서 **"알림 켜기"** 한 번 누르면 등록됨 (안 누르면 안 감).
- **안드로이드**: 크롬에서 바로 허용하면 끝.
- **아이폰**: iOS 16.4+ 에서 **Safari 공유 → "홈 화면에 추가"** 후, **그 아이콘으로 앱을 열어** "알림 켜기"를 눌러야 동작 (Safari 탭만으로는 불가).
- HTTPS 필수 → Vercel 배포 환경에서만 실제 폰 푸시 동작 (localhost는 테스트용).

## ⚠️ 운영 주의
- Supabase 무료 프로젝트는 **~1주 미사용 시 일시정지**. 여행 직전 한 번 접속해 깨워두세요(여행 중엔 매일 사용하므로 문제 없음).

---

## 다음 단계 (Phase 2~3 후보)
- 미니게임(퀴즈/룰렛/투표) `games`/`game_plays` 테이블 활용
- 풍산토큰 강탈(확률 또는 관리자 승인) 메커니즘
- 상점/경매(`shop_items`/`purchases`) — 여행 중 권한 구매
- PWA(홈화면 추가), 사운드/연출 강화
