"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="text-5xl">😵</div>
      <div>
        <h1 className="text-xl font-bold">문제가 발생했어요</h1>
        <p className="mt-2 text-sm text-white/60">
          잠시 후 다시 시도해 주세요. 계속 같은 화면이 나오면 새로고침하거나 다시 접속해 주세요.
        </p>
      </div>
      <div className="flex w-full flex-col gap-2">
        <button
          onClick={reset}
          className="w-full rounded-xl bg-gold py-2.5 font-bold text-black"
        >
          다시 시도
        </button>
        <Link
          href="/dashboard"
          className="w-full rounded-xl border border-border py-2.5 text-sm font-bold text-white/70"
        >
          대시보드로
        </Link>
      </div>
    </div>
  );
}
