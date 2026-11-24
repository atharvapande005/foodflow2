import { Link } from "react-router-dom";
import { Store } from "lucide-react";
import { useCanteen } from "@/lib/canteen";

export default function CanteenSwitcher({ variant = "sidebar" }: { variant?: "sidebar" | "header" }) {
  const { canteens, currentCanteen, selectCanteen } = useCanteen();

  if (canteens.length === 0) return null;

  if (variant === "header") {
    return (
      <Link to="/canteens" className="header-canteen" style={{ borderColor: currentCanteen?.branding.primaryColor }}>
        <span
          className="header-canteen-dot"
          style={{ background: currentCanteen?.branding.primaryColor || "#1e9a64" }}
        />
        <span>{currentCanteen?.name || "Choose canteen"}</span>
        <small>switch</small>
      </Link>
    );
  }

  return (
    <label className="side-canteen">
      <span>
        <Store size={13} /> YOUR CANTEEN
      </span>
      <select
        value={currentCanteen?._id || ""}
        onChange={(event) => selectCanteen(event.target.value || null)}
      >
        {canteens.map((canteen) => (
          <option key={canteen._id} value={canteen._id}>
            {canteen.name}
          </option>
        ))}
      </select>
    </label>
  );
}
