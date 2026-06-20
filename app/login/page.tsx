"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { idToEmail } from "@/lib/constants";

export default function LoginPage() {
  const router = useRouter();
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: idToEmail(id),
      password: pw,
    });
    setLoading(false);
    if (error) {
      setError("ID 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-black tracking-tight text-gold">풍계모 여름여행</div>
          <p className="mt-2 text-sm text-white/60">제 4회 통영-거제편</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
            placeholder="아이디"
            autoCapitalize="none"
            autoCorrect="off"
            value={id}
            onChange={(e) => setId(e.target.value)}
          />
          <input
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base outline-none focus:border-gold"
            placeholder="비밀번호"
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading || !id || !pw}
            className="w-full rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
          >
            {loading ? "로그인 중..." : "로그인"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-white/40">
          계정은 금년도 기획자(종무, 현태)에게 받으세요
        </p>
      </div>
    </main>
  );
}
