import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

const title = "제 4회 풍계모 여름여행";
const description = "통영-거제 2박3일 🏝️";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title,
  description,
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "풍계모여행",
  },
  // 아이콘은 app/icon.svg · app/apple-icon.svg · app/favicon.ico 컨벤션으로 자동 주입
  openGraph: {
    title,
    description,
    url: "/",
    siteName: title,
    type: "website",
    locale: "ko_KR",
    // 이미지는 app/opengraph-image.tsx 가 자동으로 og:image 로 연결됨
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0b0b12",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
