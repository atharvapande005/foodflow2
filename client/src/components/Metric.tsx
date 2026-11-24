import type { LucideIcon } from "lucide-react";

export default function Metric({ label, value, Icon, delta }: { label: string; value: string; Icon: LucideIcon; delta: string }) {
  return (
    <div className="metric">
      <div>
        <span>{label}</span>
        <i>
          <Icon size={17} />
        </i>
      </div>
      <strong>{value}</strong>
      <small>{delta}</small>
    </div>
  );
}
