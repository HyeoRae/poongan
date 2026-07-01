// 프로필 사진. 사진이 없으면 이름 첫 글자 + 팀색 원형 폴백.
export default function Avatar({
  url,
  name,
  color,
  size = 40,
  className = "",
}: {
  url?: string | null;
  name: string;
  color?: string | null;
  size?: number;
  className?: string;
}) {
  const accent = color || "#888888";
  const initial = name?.trim()?.[0] ?? "?";
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: accent + "33",
        border: `2px solid ${accent}`,
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={name}
          draggable={false}
          className="h-full w-full object-cover"
        />
      ) : (
        <span
          className="font-black"
          style={{ color: accent, fontSize: size * 0.42 }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
