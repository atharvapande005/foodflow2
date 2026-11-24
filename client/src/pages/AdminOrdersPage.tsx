import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import ReceiptModal from "@/components/ReceiptModal";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { orderAPI, type Canteen, type Order } from "@/lib/api";
import { formatCurrency, timeAgo, getStatusColor } from "@/lib/utils";

export default function AdminOrdersPage() {
  const { toast } = useToast();
  const { canteens } = useCanteen();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("ALL");
  const [canteenFilter, setCanteenFilter] = useState("ALL");
  const [updating, setUpdating] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    setLoading(true);
    orderAPI
      .getAll({
        status: filter !== "ALL" ? filter : undefined,
        canteenId: canteenFilter !== "ALL" ? canteenFilter : undefined,
      })
      .then((r) => setOrders(r.data.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter, canteenFilter]);

  const updateStatus = async (orderId: string, newStatus: string) => {
    if (newStatus === "CANCELLED" && !window.confirm("Reject this order? Wallet and online payments are refunded automatically.")) {
      return;
    }
    setUpdating(orderId);
    try {
      const res = await orderAPI.updateStatus(orderId, newStatus);
      setOrders((prev) =>
        prev
          .map((o) => (o._id === orderId ? res.data.order : o))
          .filter((o) => filter === "ALL" || o.status === filter)
      );
      toast(
        newStatus === "COMPLETED"
          ? "Order completed"
          : newStatus === "CANCELLED"
            ? "Order rejected"
            : `Order marked ${newStatus}`
      );
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to update order");
    } finally {
      setUpdating(null);
    }
  };

  const canteenName = (order: Order) =>
    order.canteen && typeof order.canteen === "object" ? order.canteen.name : "—";

  const studentIdFor = (order: Order) =>
    order.studentId ||
    (order.user && typeof order.user === "object" ? order.user.studentId : undefined);

  const receiptTarget =
    receiptOrder && receiptOrder.canteen && typeof receiptOrder.canteen === "object"
      ? receiptOrder.canteen
      : null;
  const receiptCanteen = receiptTarget
    ? canteens.find((canteen) => canteen._id === receiptTarget._id) ??
      (receiptTarget as unknown as Canteen)
    : null;

  return (
    <section className="page">
      <Heading title="Platform order control" sub="Every order across every canteen, with global admin authority." />

      <div className="filter-row">
        <div className="chips">
          {["ALL", "PLACED", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map((s) => (
            <button key={s} className={filter === s ? "chip on" : "chip"} onClick={() => setFilter(s)}>
              {s === "ALL" ? "All statuses" : s}
            </button>
          ))}
        </div>
        <label className="inline-select">
          Canteen
          <select value={canteenFilter} onChange={(event) => setCanteenFilter(event.target.value)}>
            <option value="ALL">All canteens</option>
            {canteens.map((canteen) => (
              <option key={canteen._id} value={canteen._id}>
                {canteen.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="loading">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders found</div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Canteen</th>
                <th>Customer</th>
                <th>Student ID</th>
                <th>Items</th>
                <th>Amount</th>
                <th>Payment</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const studentId = studentIdFor(o);
                const canComplete =
                  o.status === "PLACED" || o.status === "PREPARING" || o.status === "READY";
                const userName =
                  o.user && typeof o.user === "object" ? o.user.name : o.guestName || "Unknown";
                return (
                  <tr key={o._id}>
                    <td>
                      <b>{o.orderNumber}</b>
                      <small>{timeAgo(o.createdAt)}</small>
                    </td>
                    <td>{canteenName(o)}</td>
                    <td>{userName}</td>
                    <td>{studentId || <span className="muted">Not provided</span>}</td>
                    <td>{o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</td>
                    <td>{formatCurrency(o.totalAmount)}</td>
                    <td>
                      <span className={`status ${getStatusColor(o.paymentStatus)}`}>
                        {o.paymentMethod} · {o.paymentStatus}
                      </span>
                    </td>
                    <td>
                      <span className={`status ${getStatusColor(o.status)}`}>{o.status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {canComplete && (
                          <button
                            className="table-btn"
                            disabled={updating === o._id}
                            onClick={() => updateStatus(o._id, "COMPLETED")}
                          >
                            Complete order
                          </button>
                        )}
                        {(o.status === "PLACED" || o.status === "PREPARING") && (
                          <button
                            className="table-btn danger"
                            disabled={updating === o._id}
                            onClick={() => updateStatus(o._id, "CANCELLED")}
                          >
                            Reject
                          </button>
                        )}
                        <button className="table-btn" onClick={() => setReceiptOrder(o)}>
                          Receipt
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

      {receiptOrder && receiptCanteen && (
        <ReceiptModal
          order={receiptOrder}
          canteen={receiptCanteen}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </section>
  );
}
