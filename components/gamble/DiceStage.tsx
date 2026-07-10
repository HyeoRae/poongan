"use client";

// 🎲 주사위: 6면 pip 큐브가 두 축으로 텀블링하다 나온 눈(roll)을 정면에 정지.
// 회전값(rx, ry)·트랜지션은 오케스트레이터가 결정한다.
const S = 104; // 큐브 한 변(px)
const H = S / 2;

// 각 면을 큐브 겉면으로 밀어내는 배치 (마주보는 면 합 = 7)
const FACE_TF: Record<number, string> = {
  1: `rotateY(0deg) translateZ(${H}px)`,
  6: `rotateY(180deg) translateZ(${H}px)`,
  3: `rotateY(90deg) translateZ(${H}px)`,
  4: `rotateY(-90deg) translateZ(${H}px)`,
  2: `rotateX(90deg) translateZ(${H}px)`,
  5: `rotateX(-90deg) translateZ(${H}px)`,
};

// 3×3 그리드(행 우선 0..8)에서 점이 찍히는 칸
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ n }: { n: number }) {
  const on = PIPS[n];
  return (
    <div className="die-face" style={{ transform: FACE_TF[n] }}>
      <div className="die-grid">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={on.includes(i) ? "pip" : ""} />
        ))}
      </div>
    </div>
  );
}

export default function DiceStage({
  rx,
  ry,
  transition,
  stopped,
  win,
}: {
  rx: number;
  ry: number;
  transition: string;
  stopped: boolean;
  win: boolean;
}) {
  const glow = stopped && win;
  return (
    <div className="relative mx-auto" style={{ width: S, height: S, perspective: 800 }}>
      <div
        className="absolute inset-0"
        style={{
          transformStyle: "preserve-3d",
          transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
          transition,
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} />
        ))}
      </div>
      {/* 착지 하이라이트 */}
      <div
        className="pointer-events-none absolute inset-0 rounded-2xl"
        style={{
          boxShadow: glow ? "0 0 34px #f5c542" : "none",
          outline: glow ? "4px solid #f5c542" : "none",
          transition: "box-shadow .4s ease",
        }}
      />
      <style jsx>{`
        .die-face {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background: linear-gradient(145deg, #fbf7ec, #e7dfca);
          border: 1px solid rgba(0, 0, 0, 0.18);
          box-shadow: inset 0 0 14px rgba(0, 0, 0, 0.14);
          backface-visibility: hidden;
        }
        .die-grid {
          position: absolute;
          inset: 12px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          grid-template-rows: repeat(3, 1fr);
          place-items: center;
        }
        .pip {
          width: 18px;
          height: 18px;
          border-radius: 9999px;
          background: radial-gradient(circle at 35% 35%, #3a3a46, #0b0b12);
          box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.25);
        }
      `}</style>
    </div>
  );
}
