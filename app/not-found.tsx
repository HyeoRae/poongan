import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-6xl font-black text-gold">404</div>
      <div>
        <h1 className="text-xl font-bold">없는 페이지예요</h1>
        <p className="mt-2 text-sm text-white/60">
          주소가 바뀌었거나 사라진 페이지입니다.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="w-full rounded-xl bg-gold py-2.5 font-bold text-black"
      >
        대시보드로 가기
      </Link>
    </div>
  );
}
