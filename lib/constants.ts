// 로그인 ID를 Supabase Auth 이메일로 매핑하는 규칙.
// 사용자에겐 ID만 노출하고, 내부적으로는 <id>@<domain> 이메일로 인증한다.
export const LOGIN_EMAIL_DOMAIN =
  process.env.NEXT_PUBLIC_LOGIN_EMAIL_DOMAIN ?? "poongsan.app";

export function idToEmail(id: string): string {
  return `${id.trim().toLowerCase()}@${LOGIN_EMAIL_DOMAIN}`;
}

export function emailToId(email: string): string {
  return email.split("@")[0];
}

export type Role = "admin" | "player";

export type TxType =
  | "admin_grant"
  | "game"
  | "gamble"
  | "transfer"
  | "steal"
  | "shop"
  | "fee"      // 송금 수수료(소각)
  | "gacha";   // 효과카드 뽑기

// ---------- 경제 상수 ----------
// 송금 수수료율(20%). 밸런스 조정 시 여기 + 0016 transfer_gold 의 v_rate 를 함께 바꾼다.
export const TRANSFER_FEE_PCT = 0.2;

// ---------- 효과카드 가챠 상수 (0016 draw_effect_card 와 값 일치) ----------
export const GACHA_FREE = 3; // 초기 무료 뽑기 횟수
export const GACHA_BASE = 30; // 유료 첫 뽑기 비용
export const GACHA_STEP = 15; // 뽑을수록 증가폭 (cost = BASE + STEP * paid_count)

// 등급 추첨 확률 (꽝 40% / 상시 45% / 희귀 15%)
export const GACHA_ODDS = { blank: 0.4, passive: 0.45, consumable: 0.15 } as const;

// 효과 종류 키 (프리셋 effect_key 와 일치)
export type EffectKey =
  | "payout_boost"
  | "lucky"
  | "fee_half"
  | "double_next"
  | "bailout"
  | "mulligan"
  | "peek"
  | "fee_free"
  | "ledger";
