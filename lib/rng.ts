// 결정론적 시드 PRNG (mulberry32).
// 벌칙 뽑기 세리머니에서 모든 폰이 같은 seed 로 동일한 애니메이션을 그리도록 사용한다.
// 승자는 서버가 winner_index 로 강제하므로, 이 RNG 는 "코스메틱 무작위성"(흔들림·지터)만 담당.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 편의: [min, max) 범위 실수
export function randRange(rand: () => number, min: number, max: number) {
  return min + rand() * (max - min);
}
