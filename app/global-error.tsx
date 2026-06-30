"use client";

// 루트 레이아웃까지 깨졌을 때의 최종 폴백 — 자체 <html>/<body> 필요, globals.css 미적용 가정
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="ko">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          padding: 24,
          textAlign: "center",
          background: "#0b0b12",
          color: "#f5f5f7",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        }}
      >
        <div style={{ fontSize: 48 }}>😵</div>
        <h1 style={{ fontSize: 20, margin: 0 }}>문제가 발생했어요</h1>
        <p style={{ fontSize: 14, color: "#9a9aa6", margin: 0 }}>
          앱을 다시 불러와 주세요.
        </p>
        <button
          onClick={reset}
          style={{
            border: "none",
            borderRadius: 12,
            background: "#f5c542",
            color: "#000",
            fontWeight: 700,
            padding: "10px 24px",
            fontSize: 15,
          }}
        >
          다시 시도
        </button>
      </body>
    </html>
  );
}
