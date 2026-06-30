# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

풍산11기 여름여행 웹앱 — 통영·거제 2박3일 계모임용 모바일 웹앱. **풍산토큰** 가상경제 + 팀 대항전 + 도박/배신/송금 + 실시간 대시보드. 사용자 대면 텍스트는 모두 한국어이며, "골드"가 아니라 **"풍산토큰"** 으로 통일한다 (v1.0에서 명칭 통일됨).

> 향후 작업·미결 사항은 [TODO.md](TODO.md) 참고.

## 명령어

```bash
npm run dev              # 로컬 개발 (localhost:3000)
npm run build            # 프로덕션 빌드
npm run lint             # next lint

npm run seed             # 계정 12명 + 팀 2개 + 샘플 일정 시드 (supabase/accounts.json 필요)
npm run seed:schedule    # 일정 데이터만 재시드 (supabase/scheduleData.ts)
npm run seed:games       # 미니게임 프리셋 시드
npm run reset            # 데이터 리셋
```

테스트 프레임워크는 없다. 마이그레이션은 Supabase SQL Editor에서 `supabase/migrations/`의 파일을 **번호 순서대로** 수동 실행한다 (CLI 마이그레이션 도구 미사용). 새 스키마 변경은 다음 번호의 `00NN_*.sql` 파일로 추가한다.

## 아키텍처

**스택:** Next.js 15 (App Router, React 19) · Supabase (PostgreSQL/Auth/Realtime) · Tailwind v4 · Vercel 배포.

### 인증
- 사용자에게는 **ID/PW** 만 노출하지만 내부적으로는 Supabase Auth 이메일로 인증한다. `lib/constants.ts`의 `idToEmail()`이 `<id>@<domain>` 으로 매핑 (도메인은 `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN`). 계정은 관리자가 시드로 사전 생성하며 가입 화면이 없다.
- 권한은 `profiles.role`: `"admin"` (기획자 2명) | `"player"`.
- 서버 측 가드는 `lib/auth.ts`: `requireProfile()` (비로그인 → `/login`), `requireAdmin()` (비관리자 → `/dashboard`). 페이지/액션 진입부에서 호출한다.
- `middleware.ts` → `lib/supabase/middleware.ts`가 세션 쿠키 갱신 + 비로그인 보호 라우트 차단을 담당. **matcher에서 `sw.js`/manifest/이미지를 반드시 제외**해야 한다 (제외 안 하면 서비스워커가 로그인으로 리다이렉트되어 푸시가 깨짐 — v1.01 회귀 사례).

### 풍산토큰 경제 (핵심 불변식)
모든 토큰 변동은 **Postgres RPC(`SECURITY DEFINER`)를 통해서만** 발생한다. `profiles`/`transactions` 테이블에 직접 INSERT/UPDATE하는 RLS 정책은 **존재하지 않는다** — 클라이언트에서 잔액을 직접 쓸 수 없다.

- 모든 변동의 단일 진입점은 `_apply_gold()` ([0001_init.sql](supabase/migrations/0001_init.sql)): 행 잠금(`for update`)으로 동시성 보호, 음수 잔액 거부, `profiles.gold_balance` 갱신과 `transactions` 원장 기록을 원자적으로 수행.
- 공개 RPC는 모두 이를 경유: `admin_grant_gold` / `admin_grant_team_gold` / `transfer_gold` / 도박·게임·섯다 정산 함수 등. 관리자 전용 RPC는 내부에서 `is_admin(auth.uid())`로 재검증한다.
- **새 토큰 변동 기능은 직접 UPDATE가 아니라 `_apply_gold`를 호출하는 RPC로 구현하라.** `transactions.type`은 `lib/constants.ts`의 `TxType` 유니온과 일치시킨다.

### 데이터 변경 패턴 (Server Actions)
변동은 라우트별 `actions.ts`의 `"use server"` 함수에서 처리한다 (예: [wallet/actions.ts](app/(app)/wallet/actions.ts)). 표준 형태:
1. 입력 검증 → 실패 시 `{ ok: false, message }` (`ActionResult` 타입) 반환.
2. `createClient()` (`lib/supabase/server.ts`) 로 서버 클라이언트 생성.
3. `supabase.rpc("...")` 호출, `error.message`를 그대로 사용자 메시지로 사용.
4. `revalidatePath()`로 영향받는 경로 무효화.

### 실시간 (Realtime)
잔액·대시보드·드로우·섯다는 Supabase Realtime으로 즉시 반영된다. 클라이언트 구독 훅은 `lib/hooks.ts` (`useMyGold`, `useProfilesRealtime`, 드로우 상태 등) — `postgres_changes` 채널을 구독하고 cleanup에서 `removeChannel`. **서버에서 초기값(`initial`)을 props로 내려주고 클라이언트 훅이 이후 변동만 구독**하는 SSR+Realtime 하이드레이션 패턴을 따른다.

### 라우트 구조
- `app/(app)/*` — 인증 후 화면. 공통 `layout.tsx`가 `requireProfile()` + 비번 강제변경 체크 + 앱 비공개(`app_settings.is_public`) 시 `/locked` 리다이렉트 + `TopBar`/`BottomNav`/`DrawCeremony`/`NotificationGate`/`ServiceWorkerRegister` 셸을 렌더. 모바일 우선이라 `max-w-md` 컨테이너.
- 주요 페이지: `dashboard`(메인) · `schedule` · `gamble`(도박장: 동전·주사위·룰렛) · `games`(일정별 예측 배팅 풀) · `sutda`(실시간 멀티플레이 섯다) · `wallet`(송금/배신) · `admin`(관리자).
- 각 페이지는 보통 서버 컴포넌트 `page.tsx`(데이터 fetch + 가드) + 클라이언트 컴포넌트 `components/*.tsx`(상호작용) + `actions.ts`(변동) 3개로 구성된다.

### 코드 컨벤션
- 도메인 타입은 `lib/types.ts`에 집중, 공유 상수·유니온은 `lib/constants.ts`. 새 엔티티 추가 시 여기에 타입을 먼저 정의.
- 경로 별칭 `@/*` → 프로젝트 루트.
- 주석·UI 텍스트·커밋 메시지는 한국어. 토큰 단위는 "풍산토큰".

## 푸시 알림 / PWA
웹 푸시(VAPID)로 관리자가 참가자 폰에 공지 발송. 설정은 [README.md](README.md) "🔔 푸시 알림" 절 참고. 핵심: VAPID 키 3종 환경변수 필요, HTTPS(=Vercel)에서만 실제 동작, 아이폰은 "홈 화면에 추가" 후 그 아이콘으로 열어야 등록 가능. 서비스워커는 `public/sw.js`이며 middleware matcher에서 제외되어 있어야 한다.

## 환경변수
`.env.example` → `.env.local` 복사. `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`(클라이언트), `SUPABASE_SERVICE_ROLE_KEY`(시드 전용, **커밋 금지**), `NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN`, VAPID 키 3종. `supabase/accounts.json`도 gitignore 처리됨.

## 운영 주의
Supabase 무료 프로젝트는 ~1주 미사용 시 일시정지된다. 여행 직전 한 번 접속해 깨워둔다.
