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
// 송금 수수료율(20%). 밸런스 조정 시 여기 + 0016 transfer_gold 의 v_rate(0.20) 를 함께 바꾼다.
export const TRANSFER_FEE_PCT = 0.2;
// 큰손(fee_half) 카드 발동 시 절반 수수료(10%). 0016 transfer_gold 의 v_rate(0.10) 와 값 일치.
export const TRANSFER_FEE_HALF_PCT = 0.1;

// ---------- 효과카드 가챠 상수 (0016 draw_effect_card 와 값 일치) ----------
export const GACHA_FREE = 3; // 초기 무료 뽑기 횟수
export const GACHA_BASE = 30; // 유료 첫 뽑기 비용
export const GACHA_STEP = 15; // 뽑을수록 증가폭 (cost = BASE + STEP * paid_count)

// 등급 추첨 확률 (꽝 40% / 상시 45% / 희귀 15%)
// ⚠ 여기는 개별확률(.4/.45/.15)이지만 SQL(0016 draw_effect_card)은 누적 임계값(< 0.40, < 0.85)으로 표현한다.
//   표기가 달라 눈으로만 대조되니, 값 변경 시 blank→0.40, blank+passive→0.85 로 환산해 SQL 을 맞춘다.
export const GACHA_ODDS = { blank: 0.4, passive: 0.45, consumable: 0.15 } as const;

// ---------- 벌칙 옷 랜덤 뽑기 (0017_penalty.sql 와 값 일치) ----------
// 벌칙 옷 메타 — 라벨/이모지/사진 경로. party 만 확장자가 .jpg 임에 주의.
export const PENALTY_OUTFITS = {
  banana: { label: "바나나", emoji: "🍌", img: "/penalty/banana.png" },
  clown: { label: "광대", emoji: "🤡", img: "/penalty/clown.png" },
  mario: { label: "마리오", emoji: "🍄", img: "/penalty/mario.png" },
  party: { label: "파티", emoji: "🎉", img: "/penalty/party.jpg" },
} as const;

// 뽑기 연출 메타 — 라벨/이모지.
export const PENALTY_STYLES = {
  race: { label: "동물 달리기", emoji: "🏁" },
  plinko: { label: "구슬 레이스", emoji: "🔮" },
  slot: { label: "룰렛 회전", emoji: "🎰" },
} as const;

// 동물 달리기 대기실에서 고를 수 있는 동물 풀(선택지). 대기실은 이 중 N마리를 노출.
export const RACE_ANIMALS = [
  "🐢", "🐇", "🐷", "🐅", "🐛", "🐎", "🦆", "🐥",
  "🐸", "🐒", "🐔", "🐄", "🦖", "🦔", "🐈", "🐕",
] as const;

// 대기실 동물 수 범위 (풀 크기를 넘지 않음)
export const RACE_SLOTS_MIN = 2;
export const RACE_SLOTS_MAX = RACE_ANIMALS.length;

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
