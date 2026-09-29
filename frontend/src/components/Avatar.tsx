export function initials(name: string) {
  const parts = (name || "?")
    .replace(/[«»"]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  const a = parts[0]?.[0] || "?";
  const b = parts.length > 1 ? parts[parts.length - 1][0] : parts[0]?.[1] || "";
  return (a + b).toUpperCase();
}

export function hueOf(name: string) {
  let h = 0;
  for (const ch of name || "") h = (h * 33 + ch.charCodeAt(0)) % 360;
  return h;
}

export default function Avatar({
  name,
  src,
  size = 40,
}: {
  name: string;
  src?: string;
  size?: number;
}) {
  const h = hueOf(name);
  if (src) {
    return (
      <img
        className="avatar"
        src={src}
        alt={name}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(11, size * 0.34),
        background: `linear-gradient(145deg, hsl(${h} 42% 32%), hsl(${(h + 40) % 360} 48% 22%))`,
      }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}
