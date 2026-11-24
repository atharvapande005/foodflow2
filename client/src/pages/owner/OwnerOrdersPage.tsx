import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  CheckCheck,
  ChefHat,
  PackageCheck,
  Printer,
  Store,
  XCircle,
} from "lucide-react";
import Heading from "@/components/Heading";
import SessionBar from "@/components/SessionBar";
import ReceiptModal from "@/components/ReceiptModal";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { cashAPI, orderAPI, type Order, type OrderSummary } from "@/lib/api";
import { formatCurrency, getStatusColor, timeAgo } from "@/lib/utils";

const filters = ["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"];

function nextAction(status: Order["status"]): { label: string; next: string; icon: typeof ChefHat } | null {
  switch (status) {
    case "PLACED":
      return { label: "Accept order", next: "PREPARING", icon: ChefHat };
    case "PREPARING":
      return { label: "Mark ready", next: "READY", icon: PackageCheck };
    case "READY":
      return { label: "Complete", next: "COMPLETED", icon: CheckCheck };
    default:
      return null;
  }
}

function tokenText(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

function customerLabel(order: Order): string {
  if (typeof order.user === "object" && order.user) return order.user.name;
  return order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest");
}

export default function OwnerOrdersPage() {
  const { currentCanteen, loading: canteenLoading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const load = useCallback(() => {
    if (!currentCanteen) return;
    setLoading(true);
    Promise.all([
      orderAPI.getAll({ status: filter !== "ALL" ? filter : undefined, canteenId: currentCanteen._id }),
      orderAPI.getSummary(currentCanteen._id),
    ])
      .then(([ordersRes, summaryRes]) => {
        setOrders(ordersRes.data.orders);
        setSummary(summaryRes.data);
      })
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter, currentCanteen]);

  useEffect(load, [load]);

  if (canteenLoading) return <div className="loading">Loading canteen…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Create a canteen first</h2>
          <p>Orders are scoped to the canteen you own.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const updateStatus = async (order: Order, status: string, reason?: string) => {
    setUpdating(order._id);
    try {
      const res = await orderAPI.updateStatus(order._id, status, reason);
      setOrders((prev) => prev.map((entry) => (entry._id === order._id ? res.data.order : entry)));
      toast(res.data.message || `Order ${order.orderNumber} marked ${status}`);
      if (res.data.warning) toast(res.data.warning);
      orderAPI
        .getSummary(currentCanteen._id)
        .then((r) => setSummary(r.data))
        .catch(() => undefined);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to update order");
    } finally {
      setUpdating(null);
    }
  };

  const advance = async (order: Order) => {
    const action = nextAction(order.status);
    if (!action) return;
    if (action.next === "PREPARING" && order.paymentMethod === "ONLINE" && order.paymentStatus !== "PAID") {
      toast("Online payment has not been verified for this order yet.");
      return;
    }
    await updateStatus(order, action.next);
  };

  const reject = async (order: Order) => {
    const reason = window.prompt(
      `Reject order ${order.orderNumber}? Wallet/online payments are refunded automatically. Enter a reason (optional):`,
      "Out of stock"
    );
    if (reason === null) return;
    await updateStatus(order, "CANCELLED", reason.trim() || "Rejected by canteen");
  };

  const markCashPaid = async (order: Order) => {
    setUpdating(order._id);
    try {
      const res = await cashAPI.markPaid(order._id);
      setOrders((prev) => prev.map((entry) => (entry._id === order._id ? res.data.order : entry)));
      toast("Cash payment recorded");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Could not record cash payment");
    } finally {
      setUpdating(null);
    }
  };

  return (
    <section className="page">
      <div className="canteen-menu-header">
        <CanteenIdentity canteen={currentCanteen} compact />
        <div className="canteen-menu-status">
          <span className="status status-placed">{summary?.pending ?? 0} waiting</span>
          <small>
            {summary?.total ?? 0} orders · {formatCurrency(summary?.revenue ?? 0)} revenue
          </small>
        </div>
      </div>

      <SessionBar canteenId={currentCanteen._id} onChanged={load} />

      <Heading
        title="Order queue"
        sub={`Accept, prepare and complete orders for ${currentCanteen.name}. Tokens restart every operating session.`}
      />

      <div className="cash-summary">
        <div>
          <span>Cash revenue</span>
          <b>{formatCurrency(summary?.cashRevenue ?? 0)}</b>
        </div>
        <div>
          <span>Online revenue</span>
          <b>{formatCurrency(summary?.onlineRevenue ?? 0)}</b>
        </div>
        <div>
          <span>Wallet revenue</span>
          <b>{formatCurrency(summary?.walletRevenue ?? 0)}</b>
        </div>
        <div>
          <span>Ready for pickup</span>
          <b>{summary?.ready ?? 0}</b>
        </div>
      </div>

      <div className="chips">
        {filters.map((status) => (
          <button
            key={status}
            className={filter === status ? "chip on" : "chip"}
            onClick={() => setFilter(status)}
          >
            {status === "ALL" ? "All orders" : status}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders found for this canteen.</div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const action = nextAction(order.status);
                const canReject = order.status === "PLACED" || order.status === "PREPARING";
                return (
                  <tr key={order._id}>
                    <td>
                      <span className="token-badge">{tokenText(order.token)}</span>
                    </td>
                    <td>
                      <b>{order.orderNumber}</b>
                      <small>{timeAgo(order.createdAt)}</small>
                    </td>
                    <td>
                      {customerLabel(order)}
                      <small>{order.orderSource || "STUDENT"}</small>
                    </td>
                    <td>{order.items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</td>
                    <td>{formatCurrency(order.totalAmount)}</td>
                    <td>
                      <span className={`payment-tag ${order.paymentMethod.toLowerCase()}`}>
                        {order.paymentMethod}
                      </span>
                      <span className={`status ${getStatusColor(order.paymentStatus)}`}>{order.paymentStatus}</span>
                    </td>
                    <td>
                      <span className={`status ${getStatusColor(order.status)}`}>{order.status}</span>
                      {order.rejectionReason && order.status === "CANCELLED" && (
                        <small>{order.rejectionReason}</small>
                      )}
                    </td>
                    <td>
                      <div className="row-actions">
                        {order.paymentMethod === "CASH" && order.paymentStatus === "PENDING" && (
                          <button
                            className="btn-accept"
                            disabled={updating === order._id}
                            onClick={() => markCashPaid(order)}
                          >
                            <Banknote size={13} /> Mark cash paid
                          </button>
                        )}
                        {action && (
                          <button
                            className="table-btn"
                            disabled={updating === order._id}
                            onClick={() => advance(order)}
                          >
                            <action.icon size={13} /> {action.label}
                          </button>
                        )}
                        {canReject && (
                          <button
                            className="table-btn danger"
                            disabled={updating === order._id}
                            onClick={() => reject(order)}
                          >
                            <XCircle size={13} /> Reject
                          </button>
                        )}
                        <button className="btn-print" onClick={() => setReceiptOrder(order)}>
                          <Printer size={13} /> Receipt
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {receiptOrder && (
        <ReceiptModal order={receiptOrder} canteen={currentCanteen} onClose={() => setReceiptOrder(null)} />
      )}
    </section>
  );
}
