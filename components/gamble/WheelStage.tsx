"use client";

// 🎡 룰렛: 10분할 원판이 돌다가 나온 숫자(roll)를 12시 포인터 아래에 정지.
// 회전값(rot)·트랜지션은 오케스트레이터가 결정한다.
const R = 120; // 원판 반지름(px)
const LABEL_R = 90; // 숫자 배치 반지름(px)

export default function WheelStage({
  rot,
  transition,
  roll,
  choice,
  stopped,
  win,
}: {
  rot: number;
  transition: string;
  roll?: number;
  choice: string;
  stopped: boolean;
  win: boolean;
}) {
  // 세그먼트 색(금/암) 교대 — conic-gradient 를 -18°에서 시작해 0번 조각을 12시 중앙에 정렬
  const stops = Array.from(
    { length: 10 },
    (_, i) => `${i % 2 === 0 ? "#f5c542" : "#20202c"} ${i * 36}deg ${(i + 1) * 36}deg`
  ).join(", ");
  const bg = `conic-gradient(from -18deg, ${stops})`;

  const betSet = betNumbers(choice);

  return (
    <div className="relative mx-auto" style={{ width: R * 2, height: R * 2 }}>
      {/* 포인터 (12시 고정) */}
      <div
        className="absolute left-1/2 top-[-4px] z-20 -translate-x-1/2"
        style={{
          width: 0,
          height: 0,
          borderLeft: "13px solid transparent",
          borderRight: "13px solid transparent",
          borderTop: "22px solid #ffffff",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))",
        }}
      />
      {/* 원판 */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: bg,
          border: "6px solid #d9a520",
          boxShadow: stopped && win ? "0 0 40px #f5c542" : "none",
          transform: `rotate(${rot}deg)`,
          transition,
        }}
      >
        {Array.from({ length: 10 }, (_, i) => {
          const num = i + 1;
          const isWin = stopped && roll === num;
          const inBet = betSet.has(num);
          return (
            <div
              key={num}
              className="absolute left-1/2 top-1/2 -ml-4 -mt-4 flex h-8 w-8 items-center justify-center rounded-full text-sm font-black"
              style={{
                transform: `rotate(${i * 36}deg) translateY(${-LABEL_R}px)`,
                color: i % 2 === 0 ? "#0b0b12" : "#f5c542",
                background: isWin
                  ? "#ffffff"
                  : inBet
                  ? "rgba(255,255,255,0.16)"
                  : "transparent",
                boxShadow: isWin ? "0 0 16px #ffffff" : "none",
                outline: isWin ? "2px solid #f5c542" : "none",
              }}
            >
              {num}
            </div>
          );
        })}
      </div>
      {/* 중심 허브 */}
      <div className="absolute left-1/2 top-1/2 z-10 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-[#d9a520] bg-[#16161f] text-center text-lg leading-[36px]">
        🎯
      </div>
    </div>
  );
}

// 베팅 선택이 커버하는 숫자들(연출용 옅은 하이라이트)
function betNumbers(choice: string): Set<number> {
  if (choice === "low") return new Set([1, 2, 3, 4, 5]);
  if (choice === "high") return new Set([6, 7, 8, 9, 10]);
  if (choice === "odd") return new Set([1, 3, 5, 7, 9]);
  if (choice === "even") return new Set([2, 4, 6, 8, 10]);
  const n = Number(choice);
  return Number.isInteger(n) ? new Set([n]) : new Set<number>();
}
