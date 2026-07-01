"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { updateMyAvatar } from "@/app/(app)/dashboard/actions";
import Avatar from "@/components/Avatar";
import Spinner from "@/components/Spinner";

// 업로드 전 클라이언트에서 정사각 512px JPEG 로 축소 (모바일 원본 사진 용량 절감)
async function downscale(file: File, max = 512): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = max;
  canvas.height = max;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 미지원");
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, max, max);
  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("이미지 변환 실패"))),
      "image/jpeg",
      0.85
    )
  );
}

export default function MyProfileCard({
  userId,
  displayName,
  avatarUrl,
  teamColor,
}: {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  teamColor?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 다시 선택 가능하도록
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    setMsg(null);
    setBusy(true);
    try {
      const blob = await downscale(file);
      const supabase = createClient();
      const path = `${userId}/avatar.jpg`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${publicUrl}?v=${Date.now()}`; // 캐시 무효화

      startTransition(async () => {
        const r = await updateMyAvatar(url);
        setMsg(r.message);
        if (r.ok) router.refresh();
      });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setBusy(false);
    }
  }

  const loading = busy || pending;

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="mb-3 font-bold">🙋 내 프로필</h2>
      <div className="flex items-center gap-4">
        <Avatar url={avatarUrl} name={displayName} color={teamColor} size={64} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{displayName}</p>
          <p className="text-xs text-white/50">
            배정식·대시보드에 쓰일 사진을 등록하세요
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-xl bg-gold px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
        >
          {loading && <Spinner />}
          {avatarUrl ? "변경" : "사진 등록"}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
      />
      {msg && <p className="mt-3 text-center text-sm text-white/70">{msg}</p>}
    </section>
  );
}
