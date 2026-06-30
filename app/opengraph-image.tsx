import { ImageResponse } from "next/og";

// 카카오톡/트위터 등 SNS 공유 시 뜨는 1200×630 미리보기 카드 (동적 생성)
export const runtime = "edge";
export const alt = "제 4회 풍계모 여름여행 · 통영-거제편";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b0b12",
          color: "#f5f5f7",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 200,
            height: 200,
            borderRadius: 48,
            background: "#f5c542",
            color: "#0b0b12",
            fontSize: 130,
            fontWeight: 900,
            marginBottom: 48,
          }}
        >
          풍
        </div>
        <div style={{ fontSize: 64, fontWeight: 900, color: "#f5c542" }}>
          제 4회 풍계모 여름여행
        </div>
        <div style={{ fontSize: 38, marginTop: 20, color: "#c9c9d4" }}>
          통영 · 거제 2박3일 — 풍산토큰 대항전 🏝️
        </div>
      </div>
    ),
    { ...size }
  );
}
