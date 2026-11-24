import { formatCurrency, timeAgo, getStatusColor } from "@/lib/utils";
import type { Order } from "@/lib/api";

function tokenText(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

export default function OrderCard({ order }: { order: Order }) {
  const itemsStr = order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ");
  const userName =
    typeof order.user === "object" && order.user
      ? order.user.name
      : order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest");
  const canteenName =
    order.canteen && typeof order.canteen === "object"
      ? order.canteen.name
      : null;

  return (
    <div className="order">
      <div className="order-main">
        {order.token ? <span className="token-badge large">{tokenText(order.token)}</span> : null}
        <div>
          <b className="order-id">{order.orderNumber}</b>
          <strong>{itemsStr}</strong>
          <span>
            {canteenName && <span className="order-canteen">{canteenName}</span>}
            {userName} · {timeAgo(order.createdAt)}
          </span>
          <span style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span className={`payment-tag ${order.paymentMethod.toLowerCase()}`}>{order.paymentMethod}</span>
            <span className={`status ${getStatusColor(order.paymentStatus)}`}>{order.paymentStatus}</span>
          </span>
          {order.status === "CANCELLED" && order.rejectionReason && (
            <small style={{ color: "var(--error)" }}>Reason: {order.rejectionReason}</small>
          )}
        </div>
      </div>
      <div className="order-side">
        <strong>{formatCurrency(order.totalAmount)}</strong>
        <span className={`status ${getStatusColor(order.status)}`}>{order.status}</span>
      </div>
    </div>
  );
}
