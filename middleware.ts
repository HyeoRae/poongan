import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // _next 정적파일, 이미지, favicon, PWA 파일(sw.js/manifest/offline.html) 제외한 모든 라우트
    // ⚠ offline.html: sw.js 가 프리캐시하는 오프라인 폴백. 미제외 시 비로그인 프리캐시가 /login 으로 리다이렉트됨(v1.01급 회귀).
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline\\.html|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
