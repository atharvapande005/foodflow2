import type { Canteen } from "@/lib/api";

export function CanteenLogo({
  canteen,
  size = 54,
  className = "",
}: {
  canteen: Canteen | null;
  size?: number;
  className?: string;
}) {
  const scale = canteen?.branding.logoScale || 1;
  const dimension = Math.round(size * scale);

  if (canteen?.branding.logoUrl) {
    return (
      <img
        className={`canteen-logo ${className}`}
        src={canteen.branding.logoUrl}
        alt={`${canteen.name} logo`}
        style={{ width: dimension, height: dimension }}
      />
    );
  }

  return (
    <span
      className={`canteen-logo canteen-logo-fallback ${className}`}
      style={{
        width: dimension,
        height: dimension,
        fontSize: dimension * 0.36,
        background: `linear-gradient(135deg, ${canteen?.branding.primaryColor || "#1e9a64"}, ${
          canteen?.branding.secondaryColor || "#102117"
        })`,
      }}
    >
      {canteen?.name?.[0]?.toUpperCase() || "F"}
    </span>
  );
}

export function CanteenIdentity({
  canteen,
  compact = false,
}: {
  canteen: Canteen | null;
  compact?: boolean;
}) {
  if (!canteen) return null;
  return (
    <div className={`canteen-identity ${compact ? "compact" : ""}`}>
      <CanteenLogo canteen={canteen} size={compact ? 42 : 66} />
      <div>
        <span className="eyebrow dark">
          {canteen.institution?.collegeName || canteen.category || "CAMPUS CANTEEN"}
        </span>
        <h1>{canteen.name}</h1>
        <p>{canteen.tagline || canteen.description || "Fresh food, ready for pickup."}</p>
        <div className="canteen-meta">
          <span className={`status ${canteen.isActive && canteen.settings.acceptingOrders ? "status-ready" : "status-cancelled"}`}>
            {canteen.isActive && canteen.settings.acceptingOrders ? "Accepting orders" : "Closed"}
          </span>
          {canteen.contact?.phone && <span>{canteen.contact.phone}</span>}
          {canteen.contact?.email && <span>{canteen.contact.email}</span>}
        </div>
      </div>
    </div>
  );
}
