"use client";

import { useEffect, useRef } from "react";
import {
  initSim,
  stepSim,
  COURSE,
  W,
  MR,
  PEG_R,
  DT,
  type SimState,
} from "@/lib/penalty/marbleSim";
import type { PenaltyParticipant } from "@/lib/types";

// 🔮 구슬 레이스(마블 룰렛): 진짜 물리 시뮬(lib/penalty/marbleSim)을 그대로 재생.
// 세로/가로 모두 중력·충돌 물리로 움직이고, "먼저 결승선 통과한 구슬"이 우승.
// 시뮬은 결정론이라 서버가 정한 winner_index = 화면에서 먼저 들어온 구슬 (모든 폰 동일).
// 이 컴포넌트는 시뮬을 스텝하며 카메라 추적·순위판·미니맵·Winner 배너를 그린다.

type Props = {
  participants: PenaltyParticipant[];
  winnerIndex: number;
  seed: number;
  onDone?: () => void;
};

const PALETTE = [
  "#ff4d6d", "#4dd2ff", "#ffd24d", "#7cff5a", "#c14dff", "#ff9a3d",
  "#4dffd0", "#ff5ae0", "#5a8bff", "#ffe14d", "#ff6b6b", "#6bffb0",
];

// 코스를 다채롭게: 벽은 깊이(y)에 따라 네온색이 바뀌고, 못밭은 밭마다 다른 색.
const WALL_COLORS = ["#4dd2ff", "#7cff5a", "#ffd24d", "#ff9a3d", "#ff5ae0", "#c14dff"];
const wallColorAt = (y: number) => WALL_COLORS[Math.floor(Math.max(0, y) / 620) % WALL_COLORS.length];
const PEG_COLORS = ["#ff5ae0", "#7cff5a", "#4dd2ff"];
const pegColorAt = (y: number) => (y < 2200 ? PEG_COLORS[0] : y < 2900 ? PEG_COLORS[1] : PEG_COLORS[2]);

const HOLD_MS = 1500; // Winner 배너 유지 후 onDone

export default function Plinko({ participants, winnerIndex, seed, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const n = Math.max(1, participants.length);
    const win = Math.min(Math.max(0, winnerIndex), n - 1);
    const colors = participants.map((_, i) => PALETTE[i % PALETTE.length]);
    const reduce =
      typeof window !== "undefined" &&
      !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const speed = reduce ? 2 : 1; // 동작 줄이기면 2배속(스킵하지 않음)

    const sim: SimState = initSim(seed, n);
    const finishRank = new Int32Array(n).fill(-1); // 완주 순위(0=1등)

    // ── 캔버스 크기(HiDPI) ──
    let cssW = 0, cssH = 0, scale = 1, viewH = 0;
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      cssW = Math.max(240, r.width);
      cssH = Math.max(320, r.height);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = cssW / W;
      viewH = cssH / scale;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const neonLine = (pts: [number, number][], col: string, w: number) => {
      if (pts.length < 2) return;
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      ctx.restore();
    };

    let camY = 0;
    const finishY = COURSE.finishY;
    const render = () => {
      // 카메라: 선두(최대 y) 추적
      let lead = 0;
      for (let i = 0; i < n; i++) if (sim.y[i] > lead) lead = sim.y[i];
      const targetCam = Math.max(-100, Math.min(finishY + 120 - viewH, lead - viewH * 0.42));
      camY += (targetCam - camY) * 0.14;

      const toX = (wx: number) => wx * scale;
      const toY = (wy: number) => (wy - camY) * scale;

      ctx.clearRect(0, 0, cssW, cssH);
      ctx.fillStyle = "#07070c";
      ctx.fillRect(0, 0, cssW, cssH);

      const y0 = camY - 40;
      const y1 = camY + viewH + 40;

      // 코스 벽(보이는 범위만) — 깊이에 따라 색이 바뀌는 무지개 네온
      const drawWall = (pts: [number, number][]) => {
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if ((a[1] < y0 && b[1] < y0) || (a[1] > y1 && b[1] > y1)) continue;
          neonLine(
            [[toX(a[0]), toY(a[1])], [toX(b[0]), toY(b[1])]],
            wallColorAt((a[1] + b[1]) / 2),
            3
          );
        }
      };
      drawWall(COURSE.wallL);
      drawWall(COURSE.wallR);
      // 하단 깔때기(금색 네온)
      ctx.save();
      ctx.shadowColor = "#f5c542";
      ctx.shadowBlur = 12;
      ctx.strokeStyle = "#f5c542";
      ctx.lineWidth = 3;
      for (const g of COURSE.funnel) {
        const gy = Math.min(g.y1, g.y2), gY = Math.max(g.y1, g.y2);
        if (gY < y0 || gy > y1) continue;
        ctx.beginPath();
        ctx.moveTo(toX(g.x1), toY(g.y1));
        ctx.lineTo(toX(g.x2), toY(g.y2));
        ctx.stroke();
      }
      ctx.restore();

      // 못 — 밭마다 다른 색
      for (const pg of COURSE.pegs) {
        if (pg.y < y0 || pg.y > y1) continue;
        const col = pegColorAt(pg.y);
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = 8;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(toX(pg.x), toY(pg.y), PEG_R * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 결승선
      if (finishY >= y0 && finishY <= y1) {
        const fy = toY(finishY);
        ctx.save();
        ctx.shadowColor = "#f5c542";
        ctx.shadowBlur = 14;
        ctx.strokeStyle = "#f5c542";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(toX(150), fy);
        ctx.lineTo(toX(330), fy);
        ctx.stroke();
        ctx.restore();
      }

      // 구슬
      for (let i = 0; i < n; i++) {
        const sx = toX(sim.x[i]);
        const sy = toY(sim.y[i]);
        if (sy < -30 || sy > cssH + 30) continue;
        const r = MR * scale;
        const col = colors[i];
        const isWinDone = i === win && sim.finished[win] === 1;
        ctx.save();
        ctx.shadowColor = col;
        ctx.shadowBlur = isWinDone ? 22 : 12;
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        if (isWinDone) {
          ctx.strokeStyle = "#f5c542";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx, sy, r + 2, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.arc(sx, sy, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.font = `900 ${Math.round(r * 0.6)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(participants[i].display_name.trim()[0] ?? "?", sx, sy + 0.5);
        // 이름표
        ctx.font = "700 11px sans-serif";
        ctx.textBaseline = "top";
        ctx.fillStyle = col;
        ctx.shadowColor = "rgba(0,0,0,0.9)";
        ctx.shadowBlur = 4;
        ctx.fillText(participants[i].display_name, sx, sy + r + 3);
        ctx.shadowBlur = 0;
      }

      drawMinimap();
      drawLeaderboard();
      if (sim.finished[win]) drawWinnerBanner();
    };

    // ── 미니맵 ──
    const MM_W = 24;
    const drawMinimap = () => {
      ctx.save();
      ctx.fillStyle = "rgba(10,10,16,0.82)";
      ctx.fillRect(0, 0, MM_W, cssH);
      const mm = cssH / (finishY + 120);
      const px = (wx: number) => (wx / W) * MM_W;
      ctx.strokeStyle = "rgba(120,150,180,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 0; k < COURSE.wallL.length; k++) {
        const p = COURSE.wallL[k];
        if (k === 0) ctx.moveTo(px(p[0]), p[1] * mm);
        else ctx.lineTo(px(p[0]), p[1] * mm);
      }
      ctx.stroke();
      ctx.strokeStyle = "rgba(245,197,66,0.7)";
      ctx.strokeRect(1, Math.max(0, camY) * mm, MM_W - 2, viewH * mm);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = colors[i];
        ctx.beginPath();
        ctx.arc(px(sim.x[i]), sim.y[i] * mm, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    // ── 순위판 ──
    const drawLeaderboard = () => {
      const order = participants
        .map((_, i) => i)
        .sort((a, c) => {
          const fa = finishRank[a] >= 0, fc = finishRank[c] >= 0;
          if (fa !== fc) return fa ? -1 : 1;
          if (fa && fc) return finishRank[a] - finishRank[c];
          return sim.y[c] - sim.y[a];
        });
      const finished = sim.finishOrder.length;
      ctx.save();
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      const rx = cssW - 8;
      ctx.font = "700 12px sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillText(`${finished} / ${n}`, rx, 6);
      ctx.font = "800 13px sans-serif";
      order.slice(0, Math.min(12, n)).forEach((idx, rank) => {
        const y = 24 + rank * 17;
        const done = finishRank[idx] >= 0;
        ctx.fillStyle = colors[idx];
        const star = done && rank === 0 ? "☆ " : "";
        ctx.fillText(`${star}${participants[idx].display_name} #${rank + 1}`, rx, y);
      });
      ctx.restore();
    };

    // ── Winner 배너 ──
    const drawWinnerBanner = () => {
      ctx.save();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cxp = cssW / 2;
      const cyp = cssH * 0.5;
      ctx.font = "900 30px sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0,0,0,0.8)";
      ctx.shadowBlur = 8;
      ctx.fillText("WINNER", cxp, cyp - 26);
      ctx.font = "900 40px sans-serif";
      ctx.fillStyle = colors[win];
      ctx.shadowColor = colors[win];
      ctx.shadowBlur = 20;
      ctx.fillText(participants[win].display_name, cxp, cyp + 18);
      ctx.restore();
    };

    // ── 루프 ──
    let last = performance.now();
    let acc = 0;
    let winFinishedAt = 0;
    let called = false;
    let raf = 0;
    const frame = (now: number) => {
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05;
      acc += dt * speed;
      let guard = 0;
      while (acc >= DT && guard < 8 && !sim.finished[win]) {
        const before = sim.finishOrder.length;
        stepSim(sim);
        // 새 완주자 순위 기록
        for (let k = before; k < sim.finishOrder.length; k++) {
          finishRank[sim.finishOrder[k]] = k;
        }
        acc -= DT;
        guard++;
      }
      // 우승자 완주 시각 기록
      if (sim.finished[win] && winFinishedAt === 0) winFinishedAt = now;
      render();
      if (winFinishedAt > 0 && now - winFinishedAt >= HOLD_MS && !called) {
        called = true;
        doneRef.current?.();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  return (
    <div ref={wrapRef} className="mx-auto h-[64vh] max-h-[520px] w-full max-w-md">
      <canvas
        ref={canvasRef}
        className="h-full w-full rounded-2xl border border-border bg-[#07070c]"
      />
    </div>
  );
}
