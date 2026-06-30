"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSutdaLobby } from "@/lib/hooks";
import { createRoom, joinRoom } from "@/app/(app)/sutda/actions";
import type { SutdaRoomListItem } from "@/lib/types";
import Spinner from "@/components/Spinner";

const STATUS_LABEL: Record<string, string> = {
  waiting: "대기 중",
  betting: "진행 중",
  showdown: "결과",
};

export default function Sutda({
  me,
  rooms,
}: {
  me: { id: string; isAdmin: boolean };
  rooms: SutdaRoomListItem[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [ante, setAnte] = useState("100");
  const [msg, setMsg] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  useSutdaLobby(() => router.refresh());

  function make() {
    setMsg(null);
    startTransition(async () => {
      const r = await createRoom(name, Number(ante));
      if (!r.ok) return setMsg(r.message);
      const roomId = (r.data as { roomId: number })?.roomId;
      router.push(`/sutda?room=${roomId}`);
    });
  }

  function join(roomId: number) {
    setMsg(null);
    startTransition(async () => {
      const r = await joinRoom(roomId);
      if (!r.ok) return setMsg(r.message);
      router.push(`/sutda?room=${roomId}`);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-black">🃏 섯다</h1>
        <p className="text-xs text-white/50">참가자끼리 풍산토큰을 걸고 한 판!</p>
      </div>

      {msg && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {msg}
        </div>
      )}

      {/* 방 만들기 */}
      <section className="rounded-2xl border border-border bg-card p-4">
        {!show ? (
          <button
            onClick={() => setShow(true)}
            className="w-full rounded-xl bg-gold py-3 font-bold text-black"
          >
            + 방 만들기
          </button>
        ) : (
          <div className="space-y-3">
            <input
              className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
              placeholder="방 이름"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div>
              <label className="mb-1 block text-xs text-white/50">앤티(기본 참가비)</label>
              <input
                type="number"
                min={1}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base outline-none focus:border-gold"
                placeholder="앤티 풍산토큰"
                value={ante}
                onChange={(e) => setAnte(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={pending}
                onClick={make}
                className="flex items-center justify-center gap-2 rounded-xl bg-gold py-3 font-bold text-black disabled:opacity-50"
              >
                {pending && <Spinner />}
                만들기
              </button>
              <button
                disabled={pending}
                onClick={() => setShow(false)}
                className="rounded-xl border border-border py-3 font-bold disabled:opacity-50"
              >
                취소
              </button>
            </div>
          </div>
        )}
      </section>

      {/* 방 목록 */}
      <section className="space-y-2">
        <h2 className="text-sm font-bold text-white/70">열린 방</h2>
        {rooms.length === 0 && (
          <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-sm text-white/40">
            아직 방이 없어요. 먼저 만들어보세요!
          </p>
        )}
        {rooms.map((r) => {
          const inProgress = r.status !== "waiting";
          const canEnter = r.joined || me.isAdmin || r.status === "waiting" || r.status === "showdown";
          return (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-2xl border border-border bg-card p-4"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-bold">{r.name}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] ${
                      inProgress ? "bg-green-500/15 text-green-300" : "bg-white/10 text-white/60"
                    }`}
                  >
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
                <div className="mt-0.5 text-xs text-white/50">
                  👤 {r.player_count}/8 · 앤티 {r.ante.toLocaleString()}
                </div>
              </div>
              {r.joined ? (
                <Link
                  href={`/sutda?room=${r.id}`}
                  className="shrink-0 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-black"
                >
                  들어가기
                </Link>
              ) : me.isAdmin && inProgress ? (
                <Link
                  href={`/sutda?room=${r.id}`}
                  className="shrink-0 rounded-xl border border-gold px-4 py-2 text-sm font-bold text-gold"
                >
                  👁 참관
                </Link>
              ) : canEnter ? (
                <button
                  disabled={pending}
                  onClick={() => join(r.id)}
                  className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gold px-4 py-2 text-sm font-bold text-gold disabled:opacity-50"
                >
                  {pending && <Spinner />}
                  참가
                </button>
              ) : (
                <span className="shrink-0 text-xs text-white/30">진행 중</span>
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
