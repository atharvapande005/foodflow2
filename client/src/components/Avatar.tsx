export default function Avatar({
  name,
  src,
  size = 32,
}: {
  name: string;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      <img
        className="avatar avatar-image"
        src={src}
        alt={name}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {name?.[0]?.toUpperCase() || "?"}
    </span>
  );
}
