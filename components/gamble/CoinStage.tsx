"use client";

// 🪙 동전: rotateX 로 공중제비하듯 뒤집히다 앞/뒤에 착지.
// 회전값(rx)·트랜지션은 오케스트레이터(GambleReveal)가 결정하고, 여기선 그리기만 한다.
export default function CoinStage({
  rx,
  transition,
  stopped,
  win,
}: {
  rx: number;
  transition: string;
  stopped: boolean;
  win: boolean;
}) {
  const glow = stopped && win;
  return (
    <div style={{ perspective: 800 }} className="mx-auto">
      <div className="relative" style={{ width: 128, height: 128 }}>
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: `rotateX(${rx}deg)`,
            transition,
          }}
        >
          <div className="coin-face coin-front">앞</div>
          <div className="coin-face coin-back">뒤</div>
        </div>
        {/* 착지 하이라이트 */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            boxShadow: glow ? "0 0 44px #f5c542" : "none",
            transition: "box-shadow .4s ease",
          }}
        />
      </div>
      <style jsx>{`
        .coin-face {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 9999px;
          font-size: 2.6rem;
          font-weight: 900;
          backface-visibility: hidden;
        }
        .coin-front {
          background: radial-gradient(circle at 34% 30%, #ffe9a8, #f5c542 55%, #b8860b);
          color: #7a5600;
          border: 4px solid #d9a520;
          transform: rotateX(0deg);
          box-shadow: inset 0 0 18px rgba(122, 86, 0, 0.35);
        }
        .coin-back {
          background: radial-gradient(circle at 34% 30%, #3a3a48, #16161f 60%, #0b0b12);
          color: #f5c542;
          border: 4px solid #f5c542;
          transform: rotateX(180deg);
          box-shadow: inset 0 0 18px rgba(245, 197, 66, 0.25);
        }
      `}</style>
    </div>
  );
}
