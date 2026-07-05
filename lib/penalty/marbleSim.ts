// 🔮 구슬 레이스 물리 엔진 (서버·클라이언트 공유, 완전 결정론)
//
// [목적] 핀볼(구슬 레이스)의 당첨자는 "미리 뽑기"가 아니라 "진짜 물리로 먼저 결승선 통과한 구슬"로 정한다.
// 서버가 이 시뮬을 돌려 winner_index 를 확정하고, 클라이언트는 같은 seed 로 똑같이 재생한다.
//
// [결정론 규칙] 모든 기기(iOS/안드로이드/서버 Node)에서 비트 단위로 동일해야 하므로:
//  · Math.sin/cos/tan/pow/atan2/hypot/random 등 "구현마다 정밀도가 다른" 함수 절대 금지.
//  · 허용: +,-,*,/, Math.sqrt(IEEE 정확반올림 보장), Math.abs/min/max/floor, Math.imul, 비트연산.
//  · 고정 dt, 정수 인덱스 순회 → 연산 순서 고정.
//  이 규칙을 지키면 seed 하나로 모든 클라가 동일한 레이스·동일한 우승자를 본다.

// ── 결정론 PRNG (mulberry32: 정수연산 + 나눗셈 1회만) ──
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

// ── 월드/물리 상수 ──
export const W = 480; // 코스 가로(월드 단위)
export const MR = 13; // 구슬 반지름
export const PEG_R = 9; // 못 반지름
export const DT = 1 / 120; // 고정 타임스텝
const G = 820; // 중력(px/s²)
const VMAX = 690; // 속도 상한(터널링/과속 방지 + 페이스 조절)
const E_SEG = 0.6; // 벽 반발계수
const E_PEG = 0.8; // 못 반발계수
const E_BALL = 0.6; // 구슬끼리 반발계수
const FRICT = 0.9; // 충돌 시 접선속도 유지율(구름 마찰)
const MAX_TICKS = 20 / DT; // 완주 안전 상한(≈20초, PenaltyCeremony 22초 안전망보다 짧게)

export type Seg = { x1: number; y1: number; x2: number; y2: number };
export type Peg = { x: number; y: number };

// ── 코스(고정): 급커브가 잦은 사행 채널 + 다채로운 못밭 + 색색 범퍼 + 하단 깔때기 → 결승 ──
// 좌우 벽이 같은 위상으로 굽이치는 "가변 폭 통로" = 항상 아래로 흐름 → 구슬 갇힘 원천 차단.
// 벽 기울기를 45°보다 완만히 유지(=늘 아래 성분 존재)해 정지 지점이 안 생기게 한다.
// 결정론: sin/cos 없이 직선 키프레임 보간만 사용(각진 네온 스타일).
function buildCourse(): {
  segs: Seg[]; // 충돌 대상 전체(벽 + 깔때기)
  pegs: Peg[];
  funnel: Seg[]; // 하단 깔때기(렌더용)
  wallL: [number, number][];
  wallR: [number, number][];
  finishY: number;
  topHopperY: number;
  centerAt: (y: number) => number;
  halfAt: (y: number) => number;
} {
  const segs: Seg[] = [];
  const pegs: Peg[] = [];
  const funnel: Seg[] = [];
  const seg = (x1: number, y1: number, x2: number, y2: number) => segs.push({ x1, y1, x2, y2 });

  // 채널 중심선/반너비 키프레임 (y, cx, hw) — 굽이를 많이(9회) + 가변 폭(좁은 chicane ↔ 넓은 못밭).
  // 기울기 |Δcx/Δy| ≤ ~0.45 유지 → 벽이 충분히 가팔라 구슬이 늘 아래로 미끄러짐(정체 없음).
  const KF: [number, number, number][] = [
    [0, 240, 74],
    [320, 240, 100], // 입구 넓게
    [760, 150, 70], // 좌
    [1200, 330, 72], // 우
    [1600, 150, 118], // 좌·넓은 못밭
    [2000, 330, 118], // 우·넓은 못밭
    [2380, 160, 62], // 좌·좁게
    [2760, 320, 68], // 우
    [3140, 150, 116], // 좌·넓은 못밭
    [3520, 330, 100], // 우
    [3900, 180, 62], // 좌·좁게
    [4240, 240, 64], // 중앙 정렬(깔때기 진입)
  ];
  const LEN = KF[KF.length - 1][0];
  const sample = (y: number): { cx: number; hw: number } => {
    if (y <= 0) return { cx: KF[0][1], hw: KF[0][2] };
    for (let i = 1; i < KF.length; i++) {
      if (y <= KF[i][0]) {
        const [y0, cx0, hw0] = KF[i - 1];
        const [y1, cx1, hw1] = KF[i];
        const t = (y - y0) / (y1 - y0);
        return { cx: cx0 + (cx1 - cx0) * t, hw: hw0 + (hw1 - hw0) * t };
      }
    }
    const l = KF[KF.length - 1];
    return { cx: l[1], hw: l[2] };
  };
  const centerAt = (y: number) => sample(y).cx;
  const halfAt = (y: number) => sample(y).hw;

  // 벽 폴리라인(촘촘히) → 선분화. 급커브 대응 위해 더 촘촘히.
  const wallL: [number, number][] = [];
  const wallR: [number, number][] = [];
  const STEP = 28;
  for (let y = 0; y <= LEN; y += STEP) {
    const { cx, hw } = sample(y);
    wallL.push([cx - hw, y]);
    wallR.push([cx + hw, y]);
  }
  for (let i = 1; i < wallL.length; i++) {
    seg(wallL[i - 1][0], wallL[i - 1][1], wallL[i][0], wallL[i][1]);
    seg(wallR[i - 1][0], wallR[i - 1][1], wallR[i][0], wallR[i][1]);
  }

  // 못밭(넓은 구간 여러 곳) — 열 수를 달리해 패턴에 변화
  const addPegs = (y0: number, y1: number, rowGap: number, cols: number, stagger: boolean) => {
    let row = 0;
    for (let y = y0; y <= y1; y += rowGap, row++) {
      const { cx, hw } = sample(y);
      const inner = hw - MR - PEG_R - 8;
      if (inner < 20) continue;
      for (let c = 0; c < cols; c++) {
        const off = ((c + 0.5) / cols - 0.5) * 2 * inner;
        const stag = stagger && row % 2 ? inner / cols : 0;
        pegs.push({ x: cx + off + stag, y });
      }
    }
  };
  // 못밭 여러 곳 — 열 수·스태거를 달리해 패턴 변화(렌더에서 색도 밭마다 다르게)
  addPegs(1560, 1980, 150, 3, false); // 넓은 밭1
  addPegs(2440, 2700, 130, 2, true); // 중단 밭2(스태거 2열)
  addPegs(3160, 3500, 150, 3, true); // 넓은 밭3(스태거 3열)

  // 하단 깔때기 → 중앙 결승 통로
  const funnelTop = LEN;
  const finishY = funnelTop + 250;
  const fseg = (x1: number, y1: number, x2: number, y2: number) => {
    const s = { x1, y1, x2, y2 };
    segs.push(s);
    funnel.push(s);
  };
  const endC = sample(LEN).cx;
  const endH = sample(LEN).hw;
  fseg(endC - endH, LEN, 210, finishY - 20); // 좌 깔때기(중앙으로)
  fseg(endC + endH, LEN, 270, finishY - 20); // 우 깔때기
  fseg(210, finishY - 20, 210, finishY + 40);
  fseg(270, finishY - 20, 270, finishY + 40);

  const topHopperY = 40;
  return { segs, pegs, funnel, wallL, wallR, finishY, topHopperY, centerAt, halfAt };
}

export const COURSE = buildCourse();

export type SimState = {
  n: number;
  x: Float64Array;
  y: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  maxY: Float64Array; // 지금까지 도달한 최고 깊이(진행 판정)
  noProg: Int32Array; // 최고 깊이 갱신 없이 지난 틱(anti-stall)
  finished: Int8Array;
  finishOrder: number[]; // 완주 순서(구슬 index)
  tick: number;
  done: boolean; // 첫 완주 발생(=우승 확정)
};

export function initSim(seed: number, n: number): SimState {
  const rand = mulberry32(seed >>> 0);
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const vx = new Float64Array(n);
  const vy = new Float64Array(n);
  // 상단 채널 폭 안에 가로로 흩뿌려 투입(약간의 시드 지터가 카오스의 씨앗).
  // 여러 줄로 살짝 위에서 떨어뜨려 캐스케이드로 진입.
  const cx0 = COURSE.centerAt(0);
  const inner = COURSE.halfAt(0) - MR - 4;
  const perRow = Math.max(1, Math.min(n, 5));
  for (let i = 0; i < n; i++) {
    const colIdx = i % perRow;
    const rowIdx = Math.floor(i / perRow);
    const base = perRow <= 1 ? 0 : (colIdx / (perRow - 1) - 0.5) * 2 * inner;
    x[i] = cx0 + base + (rand() - 0.5) * 16;
    y[i] = COURSE.topHopperY - 20 - rowIdx * (MR * 2 + 8) - rand() * 10;
    vx[i] = (rand() - 0.5) * 50;
    vy[i] = 0;
  }
  return {
    n,
    x,
    y,
    vx,
    vy,
    maxY: Float64Array.from(y),
    noProg: new Int32Array(n),
    finished: new Int8Array(n),
    finishOrder: [],
    tick: 0,
    done: false,
  };
}

// 원(구슬) vs 선분 충돌 해소
function collideSeg(s: SimState, i: number, seg: Seg) {
  const px = s.x[i];
  const py = s.y[i];
  const ex = seg.x2 - seg.x1;
  const ey = seg.y2 - seg.y1;
  const len2 = ex * ex + ey * ey;
  let t = len2 > 0 ? ((px - seg.x1) * ex + (py - seg.y1) * ey) / len2 : 0;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const cx = seg.x1 + ex * t;
  const cy = seg.y1 + ey * t;
  let dx = px - cx;
  let dy = py - cy;
  let d2 = dx * dx + dy * dy;
  if (d2 >= MR * MR || d2 <= 1e-9) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  // 밀어내기
  const pen = MR - d;
  s.x[i] += nx * pen;
  s.y[i] += ny * pen;
  // 속도 반사(법선 성분만) + 접선 마찰
  const vn = s.vx[i] * nx + s.vy[i] * ny;
  if (vn < 0) {
    const tx = -ny;
    const ty = nx;
    let vt = s.vx[i] * tx + s.vy[i] * ty;
    vt *= FRICT;
    const newVn = -vn * E_SEG;
    s.vx[i] = tx * vt + nx * newVn;
    s.vy[i] = ty * vt + ny * newVn;
  }
}

// 원(구슬) vs 못(원) 충돌
function collidePeg(s: SimState, i: number, pg: Peg) {
  let dx = s.x[i] - pg.x;
  let dy = s.y[i] - pg.y;
  const rr = MR + PEG_R;
  let d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 <= 1e-9) return;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const pen = rr - d;
  s.x[i] += nx * pen;
  s.y[i] += ny * pen;
  const vn = s.vx[i] * nx + s.vy[i] * ny;
  if (vn < 0) {
    const tx = -ny;
    const ty = nx;
    let vt = (s.vx[i] * tx + s.vy[i] * ty) * FRICT;
    const newVn = -vn * E_PEG;
    s.vx[i] = tx * vt + nx * newVn;
    s.vy[i] = ty * vt + ny * newVn;
  }
}

// 한 틱 진행
export function stepSim(s: SimState) {
  const { segs, pegs, finishY } = COURSE;
  const n = s.n;
  for (let i = 0; i < n; i++) {
    if (s.finished[i]) continue;
    // 중력 + 적분
    s.vy[i] += G * DT;
    // 속도 상한
    let sp2 = s.vx[i] * s.vx[i] + s.vy[i] * s.vy[i];
    if (sp2 > VMAX * VMAX) {
      const sc = VMAX / Math.sqrt(sp2);
      s.vx[i] *= sc;
      s.vy[i] *= sc;
    }
    s.x[i] += s.vx[i] * DT;
    s.y[i] += s.vy[i] * DT;
    // 충돌: 선분(같은 높이 근처만) + 못
    for (let k = 0; k < segs.length; k++) {
      const g = segs[k];
      const ymin = (g.y1 < g.y2 ? g.y1 : g.y2) - MR;
      const ymax = (g.y1 > g.y2 ? g.y1 : g.y2) + MR;
      if (s.y[i] < ymin || s.y[i] > ymax) continue;
      collideSeg(s, i, g);
    }
    for (let k = 0; k < pegs.length; k++) {
      if (Math.abs(pegs[k].y - s.y[i]) > MR + PEG_R) continue;
      collidePeg(s, i, pegs[k]);
    }
    // 외벽 안전 클램프
    if (s.x[i] < MR) {
      s.x[i] = MR;
      if (s.vx[i] < 0) s.vx[i] = -s.vx[i] * E_SEG;
    } else if (s.x[i] > W - MR) {
      s.x[i] = W - MR;
      if (s.vx[i] > 0) s.vx[i] = -s.vx[i] * E_SEG;
    }
    // anti-stall (진행 기반): "아래로의 진행"이 일정 시간 없으면 강제 이탈.
    // 속도가 아니라 최고 깊이(maxY) 갱신 여부로 판단 → 못/범퍼/코너 위 균형은 물론
    // "포켓에서 계속 튕기지만 못 내려가는" 한계순환까지 모두 잡는다. 결정론(순수 산술).
    if (s.y[i] > s.maxY[i]) {
      s.maxY[i] = s.y[i];
      s.noProg[i] = 0;
    } else {
      s.noProg[i]++;
      // 0.4초 넘게 더 깊이 못 내려가면(정체·배회·포켓 튕김) 아래로 강제 진행 → 완주 시간 상한.
      if (s.noProg[i] > 42) {
        const dir = i & 1 ? 1 : -1;
        s.y[i] += 8; // 장애물 아래로 관통시켜 탈출
        s.maxY[i] = s.y[i];
        s.vy[i] = 255;
        s.vx[i] += dir * 120;
        s.noProg[i] = 0;
      }
    }
    // 완주 판정
    if (s.y[i] >= finishY && !s.finished[i]) {
      s.finished[i] = 1;
      s.finishOrder.push(i);
      s.done = true;
    }
  }
  // 구슬끼리 충돌(가벼운 탄성) — 인덱스 순서 고정
  for (let i = 0; i < n; i++) {
    if (s.finished[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (s.finished[j]) continue;
      let dx = s.x[j] - s.x[i];
      let dy = s.y[j] - s.y[i];
      const rr = MR + MR;
      let d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr || d2 <= 1e-9) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const ny = dy / d;
      const pen = (rr - d) / 2;
      s.x[i] -= nx * pen;
      s.y[i] -= ny * pen;
      s.x[j] += nx * pen;
      s.y[j] += ny * pen;
      // 법선 속도 교환(질량 동일)
      const vni = s.vx[i] * nx + s.vy[i] * ny;
      const vnj = s.vx[j] * nx + s.vy[j] * ny;
      if (vni - vnj > 0) {
        const imp = ((1 + E_BALL) * (vni - vnj)) / 2;
        s.vx[i] -= imp * nx;
        s.vy[i] -= imp * ny;
        s.vx[j] += imp * nx;
        s.vy[j] += imp * ny;
      }
    }
  }
  s.tick++;
}

// 서버용: seed·인원으로 물리를 끝까지 돌려 "1등 구슬 index" 반환.
export function runWinner(seed: number, n: number): number {
  if (n <= 1) return 0;
  const s = initSim(seed, n);
  while (!s.done && s.tick < MAX_TICKS) stepSim(s);
  if (s.finishOrder.length > 0) return s.finishOrder[0];
  // 안전상한 도달 시(이론상 거의 없음): 가장 아래 구슬을 우승 처리
  let best = 0;
  for (let i = 1; i < n; i++) if (s.y[i] > s.y[best]) best = i;
  return best;
}
