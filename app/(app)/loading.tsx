export default function Loading() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-border border-t-gold" />
      <p className="text-sm text-white/50">불러오는 중…</p>
    </div>
  );
}
