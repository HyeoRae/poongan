// 섯다 공용 로직 — 화투 이미지 매핑 + 족보 평가(표시 전용).
// 승부 판정의 단일 진실은 DB(_sutda_rank + 쇼다운 보정). 여기 TS는 화면 표시용.
// 논리 덱: 카드 1~20. 월 = floor((card-1)/2)+1 (1~10월, 각 2장). 광 = 1·5·15.

export const CARD_BACK = "/hwatu_pack/back.svg";

// 논리카드 1~20 → hwatu_pack 파일명 (deck.json: mXX_1 / mXX_2)
const CARD_FILE: Record<number, string> = {
  1: "m01_1_gwang",
  2: "m01_2_tti",
  3: "m02_1_yeolggeut",
  4: "m02_2_tti",
  5: "m03_1_gwang",
  6: "m03_2_tti",
  7: "m04_1_yeolggeut",
  8: "m04_2_tti",
  9: "m05_1_yeolggeut",
  10: "m05_2_tti",
  11: "m06_1_yeolggeut",
  12: "m06_2_tti",
  13: "m07_1_yeolggeut",
  14: "m07_2_tti",
  15: "m08_1_gwang",
  16: "m08_2_yeolggeut",
  17: "m09_1_yeolggeut",
  18: "m09_2_tti",
  19: "m10_1_yeolggeut",
  20: "m10_2_tti",
};

export function cardImg(card: number): string {
  const f = CARD_FILE[card];
  return f ? `/hwatu_pack/cards/${f}.png` : CARD_BACK;
}

export function monthOf(card: number): number {
  return Math.floor((card - 1) / 2) + 1;
}

export function isGwang(card: number): boolean {
  return card === 1 || card === 5 || card === 15;
}

// DB _sutda_rank 와 동일 (잡이패 보정 제외 — 상대 패를 모르므로 기본값)
export function rankOf(c1: number, c2: number): number {
  const m1 = monthOf(c1);
  const m2 = monthOf(c2);
  const lo = Math.min(m1, m2);
  const hi = Math.max(m1, m2);
  if (isGwang(c1) && isGwang(c2)) {
    if (lo === 3 && hi === 8) return 10030;
    if (lo === 1 && hi === 8) return 10020;
    if (lo === 1 && hi === 3) return 10010;
  }
  if (m1 === m2) return 8000 + m1 * 10;
  if (lo === 1 && hi === 2) return 7050;
  if (lo === 1 && hi === 4) return 7040;
  if (lo === 1 && hi === 9) return 7030;
  if (lo === 4 && hi === 10) return 7020;
  if (lo === 4 && hi === 6) return 7010;
  return 6000 + ((m1 + m2) % 10) * 10;
}

// DB _sutda_label 과 동일
export function labelOf(c1: number, c2: number): string {
  const m1 = monthOf(c1);
  const m2 = monthOf(c2);
  const lo = Math.min(m1, m2);
  const hi = Math.max(m1, m2);
  const k = (m1 + m2) % 10;
  if (isGwang(c1) && isGwang(c2)) {
    if (lo === 3 && hi === 8) return "38광땡";
    if (lo === 1 && hi === 8) return "18광땡";
    if (lo === 1 && hi === 3) return "13광땡";
  }
  if (m1 === m2) return m1 === 10 ? "장땡" : `${m1}땡`;
  if (lo === 1 && hi === 2) return "알리";
  if (lo === 1 && hi === 4) return "독사";
  if (lo === 1 && hi === 9) return "구삥";
  if (lo === 4 && hi === 10) return "장사";
  if (lo === 4 && hi === 6) return "세륙";
  if (lo === 4 && hi === 7) return "암행어사";
  if (lo === 3 && hi === 7) return "땡잡이";
  if (lo === 4 && hi === 9) return "멍텅구리구사";
  if (k === 9) return "갑오(9끗)";
  if (k === 0) return "망통";
  return `${k}끗`;
}

// 멍텅구리구사(4·9) 여부 — 재경기 버튼 노출용
export function isGusa(c1: number, c2: number | null): boolean {
  if (c2 == null) return false;
  const lo = Math.min(monthOf(c1), monthOf(c2));
  const hi = Math.max(monthOf(c1), monthOf(c2));
  return lo === 4 && hi === 9;
}

// 족보표(높은 순) — SutdaRankGuide 에서 사용
export type RankGuideRow = { tier: string; items: string[] };
export const RANK_GUIDE: RankGuideRow[] = [
  { tier: "광땡", items: ["38광땡", "18광땡", "13광땡"] },
  { tier: "땡", items: ["장땡(10)", "9땡", "8땡", "…", "1땡"] },
  { tier: "특수", items: ["알리(1·2)", "독사(1·4)", "구삥(1·9)", "장사(4·10)", "세륙(4·6)"] },
  { tier: "끗", items: ["갑오(9끗)", "8끗", "…", "1끗", "망통(0)"] },
];

export const JABI_GUIDE: { name: string; pair: string; desc: string }[] = [
  { name: "암행어사", pair: "4·7", desc: "13·18광땡을 잡음 (38광땡은 못 잡음)" },
  { name: "땡잡이", pair: "3·7", desc: "상대의 땡을 잡음 (광땡엔 짐)" },
  { name: "멍텅구리구사", pair: "4·9", desc: "내 차례에 한 번 패를 다시 받을 수 있음" },
];
