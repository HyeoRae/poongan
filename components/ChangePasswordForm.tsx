"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/app/change-password/actions";

export default function ChangePasswordForm({
  displayName,
}: {
  displayName: string;
}) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (pw.length < 6) {
      setError("비밀번호는 6자 이상이어야 합니다.");
      return;
    }
    if (pw !== pw2) {
      setError("두 비밀번호가 일치하지 않습니다.");
      return;
    }
    startTransition(async () => {
      const res = await changePassword(pw);
      if (!res.ok) {
        setError(res.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-3xl font-black text-gold">환영합니다, {displayName}님!</div>
          <p className="mt-3 text-sm text-white/70">
            첫 로그인입니다 🎉
            <br />
            안전을 위해 비밀번호를 새로 설정해주세요.
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
            type="password"
            placeholder="새 비밀번호 (6자 이상)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
            type="password"
            placeholder="새 비밀번호 확인"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={pending || !pw || !pw2}
            className="w-full rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
          >
            {pending ? "변경 중..." : "비밀번호 변경하고 시작하기"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          잊어버리지 않게 잘 기억해두세요!
        </p>
      </div>
    </main>
  );
}
