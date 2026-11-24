import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Banknote, Printer, ShoppingBasket, Store, Trash2 } from "lucide-react";
import Heading from "@/components/Heading";
import SessionBar from "@/components/SessionBar";
import ReceiptModal from "@/components/ReceiptModal";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useCanteen } from "@/lib/canteen";
import { useToast } from "@/lib/toast";
import { cashAPI, canteenAPI, menuAPI, type MenuItem, type Order, type OperatingSession } from "@/lib/api";
import { formatCurrency, getStatusColor, timeAgo } from "@/lib/utils";

function localDate(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function tokenText(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

interface CartLine {
  item: MenuItem;
  quantity: number;
}

export default function CashPaymentsPage() {
  const { currentCanteen, loading: canteenLoading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState({ orders: 0, collected: 0, pending: 0 });
  const [session, setSession] = useState<OperatingSession | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [lastOrder, setLastOrder] = useState<Order | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const canteenId = currentCanteen?._id;

  const loadMenu = useCallback(() => {
    if (!canteenId) return;
    menuAPI
      .getAll({ canteenId })
      .then((res) => setMenu(res.data.items))
      .catch(() => setMenu([]));
  }, [canteenId]);

  const loadOrders = useCallback(() => {
    if (!canteenId) return;
    cashAPI
      .list({ canteenId, date: localDate() })
      .then((res) => {
        setOrders(res.data.orders);
        setSummary(res.data.summary);
      })
      .catch(() => {
        setOrders([]);
        setSummary({ orders: 0, collected: 0, pending: 0 });
      });
  }, [canteenId]);

  const loadSession = useCallback(() => {
    if (!canteenId) return;
    canteenAPI
      .getSession(canteenId)
      .then((res) => setSession(res.data.session))
      .catch(() => setSession(null));
  }, [canteenId]);

  useEffect(() => {
    if (!canteenId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([menuAPI.getAll({ canteenId }), cashAPI.list({ canteenId, date: localDate() }), canteenAPI.getSession(canteenId)])
      .then(([menuRes, cashRes, sessionRes]) => {
        setMenu(menuRes.data.items);
        setOrders(cashRes.data.orders);
        setSummary(cashRes.data.summary);
        setSession(sessionRes.data.session);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
    setCart([]);
  }, [canteenId]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0),
    [cart]
  );

  if (canteenLoading || loading) return <div className="loading">Loading cash counter…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Create a canteen first</h2>
          <p>The cash counter records counter sales for your canteen.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const isOpen = session?.status === "OPEN";

  const addItem = (item: MenuItem) => {
    if (!isOpen) {
      toast("Start the canteen session before recording a cash order.");
      return;
    }
    if (typeof item.stock === "number" && item.stock <= 0) {
      toast(`${item.name} is out of stock`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((line) => line.item._id === item._id);
      if (existing) {
        if (typeof item.stock === "number" && existing.quantity >= item.stock) {
          toast(`Only ${item.stock} of ${item.name} available`);
          return prev;
        }
        return prev.map((line) =>
          line.item._id === item._id ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
  };

  const changeQuantity = (itemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((line) => {
          if (line.item._id !== itemId) return line;
          const max = typeof line.item.stock === "number" ? line.item.stock : 99;
          const next = Math.min(max, line.quantity + delta);
          return { ...line, quantity: next };
        })
        .filter((line) => line.quantity > 0)
    );
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) {
      toast("Add at least one item to the counter cart");
      return;
    }
    if (!isOpen) {
      toast("Start the canteen session before recording a cash order.");
      return;
    }
    setPlacing(true);
    try {
      const res = await cashAPI.create({
        canteenId: currentCanteen._id,
        items: cart.map((line) => ({ menuItem: line.item._id, quantity: line.quantity })),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const order = res.data.order;
      setLastOrder(order);
      setCart([]);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      toast(res.data.message);
      loadMenu();
      loadOrders();
      loadSession();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to record the cash order");
    } finally {
      setPlacing(false);
    }
  };

  const markPaid = async (order: Order) => {
    try {
      const res = await cashAPI.markPaid(order._id);
      setOrders((prev) => prev.map((entry) => (entry._id === order._id ? res.data.order : entry)));
      toast("Cash payment recorded");
      loadOrders();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Could not record the payment");
    }
  };

  return (
    <section className="page">
      <div className="canteen-menu-header">
        <CanteenIdentity canteen={currentCanteen} compact />
        <div className="canteen-menu-status">
          <span className={`status ${isOpen ? "status-ready" : "status-cancelled"}`}>
            {isOpen ? "Session open" : "Session closed"}
          </span>
          <small>Customer pays at the counter</small>
        </div>
      </div>

      <Heading
        title="Cash payments"
        sub={`Record counter sales for ${currentCanteen.name}. Cash revenue is tracked separately from online payments.`}
      />

      <SessionBar canteenId={currentCanteen._id} onChanged={() => { loadSession(); loadOrders(); }} />

      {!isOpen && (
        <div className="notice warning">
          Start the operating session above to record cash orders and issue tokens.
        </div>
      )}

      <div className="cash-summary">
        <div>
          <span>Cash orders today</span>
          <b>{summary.orders}</b>
        </div>
        <div>
          <span>Cash collected</span>
          <b>{formatCurrency(summary.collected)}</b>
        </div>
        <div>
          <span>Awaiting payment</span>
          <b>{summary.pending}</b>
        </div>
      </div>

      <div className="cash-layout">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Counter menu</h2>
              <p>Tap an item to add it to the counter cart.</p>
            </div>
            <ShoppingBasket size={18} />
          </div>
          <div className="cash-menu-grid">
            {menu.map((item) => (
              <button
                key={item._id}
                className="cash-item"
                onClick={() => addItem(item)}
                disabled={!isOpen || !item.available || (typeof item.stock === "number" && item.stock <= 0)}
              >
                <b>
                  {item.emoji || "🍽️"} {item.name}
                </b>
                <span>
                  {item.category}
                  {typeof item.stock === "number" ? ` · ${item.stock} left` : " · unlimited"}
                </span>
                <strong>{formatCurrency(item.price)}</strong>
              </button>
            ))}
            {!menu.length && <div className="empty-inline">Add menu items before recording cash sales.</div>}
          </div>

          {lastOrder && (
            <div className="token-card" style={{ marginTop: 18, marginBottom: 0 }}>
              <div className="token-large">{tokenText(lastOrder.token)}</div>
              <div className="token-meta">
                <strong>Last counter sale · {lastOrder.orderNumber}</strong>
                <span>
                  {formatCurrency(lastOrder.totalAmount)} · Cash {lastOrder.paymentStatus.toLowerCase()}
                </span>
              </div>
              <div style={{ marginLeft: "auto" }}>
                <button className="btn-print" onClick={() => setReceiptOrder(lastOrder)}>
                  <Printer size={14} /> Print token
                </button>
              </div>
            </div>
          )}
        </div>

        <form className="panel cash-cart" onSubmit={submit}>
          <div className="panel-head">
            <div>
              <h2>Counter cart</h2>
              <p>Cash is collected before the order is recorded.</p>
            </div>
            <Banknote size={18} />
          </div>

          {!cart.length ? (
            <div className="empty-inline">No items in the counter cart yet.</div>
          ) : (
            cart.map((line) => (
              <div className="cash-line" key={line.item._id}>
                <b>{line.item.name}</b>
                <span className="qty-controls">
                  <button type="button" onClick={() => changeQuantity(line.item._id, -1)}>
                    −
                  </button>
                  <span>{line.quantity}</span>
                  <button type="button" onClick={() => changeQuantity(line.item._id, 1)}>
                    +
                  </button>
                </span>
                <span>{formatCurrency(line.item.price * line.quantity)}</span>
              </div>
            ))
          )}

          {cart.length > 0 && (
            <button type="button" className="btn-small" onClick={() => setCart([])} style={{ marginTop: 10 }}>
              <Trash2 size={13} /> Clear cart
            </button>
          )}

          <div className="cash-total">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>

          <div className="form-grid">
            <label>
              Customer name (optional)
              <input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Walk-in customer" />
            </label>
            <label>
              Phone (optional)
              <input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="+91…" />
            </label>
          </div>
          <label>
            Notes (optional)
            <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Special instructions" />
          </label>

          <button className="primary" type="submit" disabled={placing || !isOpen || !cart.length} style={{ width: "100%", justifyContent: "center" }}>
            <Banknote size={15} /> {placing ? "Recording…" : `Collect ${formatCurrency(total)} & issue token`}
          </button>
        </form>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <div>
            <h2>Cash orders today</h2>
            <p>Guest QR orders appear here until cash is collected.</p>
          </div>
        </div>
        {!orders.length ? (
          <div className="empty-inline">No cash orders recorded today.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <span className="token-badge">{tokenText(order.token)}</span>
                    </td>
                    <td>
                      <b>{order.orderNumber}</b>
                      <small>{timeAgo(order.createdAt)}</small>
                    </td>
                    <td>
                      {typeof order.user === "object" && order.user
                        ? order.user.name
                        : order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest")}
                    </td>
                    <td>{formatCurrency(order.totalAmount)}</td>
                    <td>
                      <span className={`status ${getStatusColor(order.paymentStatus)}`}>{order.paymentStatus}</span>
                    </td>
                    <td>
                      <span className={`status ${getStatusColor(order.status)}`}>{order.status}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {order.paymentStatus === "PENDING" && (
                          <button className="btn-accept" onClick={() => markPaid(order)}>
                            <Banknote size={13} /> Mark paid
                          </button>
                        )}
                        <button className="btn-print" onClick={() => setReceiptOrder(order)}>
                          <Printer size={13} /> Receipt
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {receiptOrder && (
        <ReceiptModal order={receiptOrder} canteen={currentCanteen} onClose={() => setReceiptOrder(null)} />
      )}
    </section>
  );
}
