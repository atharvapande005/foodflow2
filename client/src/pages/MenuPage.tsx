import { useState, useEffect, useMemo } from "react";
import { ArrowRight, CheckCircle2, CreditCard, Store, Wallet } from "lucide-react";
import { useNavigate } from "react-router-dom";
import FoodCard, { CartBar } from "@/components/FoodCard";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { useAuth } from "@/lib/auth";
import { useCanteen } from "@/lib/canteen";
import { menuAPI, orderAPI, paymentAPI, type MenuItem } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";
import { loadRazorpayScript } from "@/lib/razorpay";

interface CartEntry {
  item: MenuItem;
  quantity: number;
}

interface PlacedOrder {
  orderNumber: string;
  token?: number | null;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
}

function tokenText(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

export default function MenuPage() {
  const { toast } = useToast();
  const { updateWallet, user } = useAuth();
  const { currentCanteen, loading: canteenLoading } = useCanteen();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [activeCategory, setActiveCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"WALLET" | "ONLINE">("WALLET");
  const [onlineConfigured, setOnlineConfigured] = useState<boolean | null>(null);
  const [successOrder, setSuccessOrder] = useState<PlacedOrder | null>(null);

  const canteenId = currentCanteen?._id;

  const refreshMenu = () => {
    if (!canteenId) return;
    menuAPI
      .getAll({ canteenId })
      .then((res) => setMenu(res.data.items))
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!canteenId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setCart([]);
    setActiveCategory("All");
    setSuccessOrder(null);
    Promise.all([menuAPI.getAll({ canteenId }), menuAPI.getCategories(canteenId)])
      .then(([menuRes, catRes]) => {
        setMenu(menuRes.data.items);
        setCategories(["All", ...catRes.data.categories.filter((c) => c && c !== "All")]);
      })
      .catch(() => {
        setMenu([]);
        setCategories(["All"]);
      })
      .finally(() => setLoading(false));
  }, [canteenId]);

  useEffect(() => {
    paymentAPI
      .getConfig()
      .then((res) => {
        setOnlineConfigured(res.data.configured);
        if (!res.data.configured) setPaymentMethod("WALLET");
      })
      .catch(() => setOnlineConfigured(false));
  }, []);

  const filtered = useMemo(() => {
    return menu.filter(
      (item) =>
        (activeCategory === "All" || item.category === activeCategory) &&
        item.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [menu, activeCategory, search]);

  if (canteenLoading) return <div className="loading">Loading canteen…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Choose a canteen first</h2>
          <p>Select a canteen to see its menu and place an order.</p>
          <button className="primary" onClick={() => navigate("/canteens")}>
            Browse canteens <ArrowRight size={15} />
          </button>
        </div>
      </section>
    );
  }

  const isClosed = !currentCanteen.isActive || !currentCanteen.settings.acceptingOrders;
  const cartTotal = cart.reduce((sum, entry) => sum + entry.item.price * entry.quantity, 0);

  const addToCart = (item: MenuItem) => {
    if (isClosed) {
      toast("This canteen is not accepting orders right now.");
      return;
    }
    if (typeof item.stock === "number" && item.stock <= 0) {
      toast(`${item.name} is out of stock`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((e) => e.item._id === item._id);
      if (existing) {
        if (typeof item.stock === "number" && existing.quantity >= item.stock) {
          toast(`Only ${item.stock} of ${item.name} available`);
          return prev;
        }
        return prev.map((e) =>
          e.item._id === item._id ? { ...e, quantity: e.quantity + 1 } : e
        );
      }
      return [...prev, { item, quantity: 1 }];
    });
    toast(`${item.name} added to cart`);
  };

  const clearCart = () => setCart([]);

  const handleOnlinePayment = async (items: { menuItem: string; quantity: number }[]) => {
    const created = await paymentAPI.createOnlineOrder({
      canteenId: currentCanteen._id,
      items,
    });

    const ready = await loadRazorpayScript();
    if (!ready) {
      await paymentAPI.failed(created.data.order.id).catch(() => undefined);
      toast("Could not load the Razorpay checkout. Check your connection and try again.");
      setPlacing(false);
      refreshMenu();
      return;
    }

    const key = created.data.payment.keyId;
    if (!key || !window.Razorpay) {
      await paymentAPI.failed(created.data.order.id).catch(() => undefined);
      toast("Online payments are not configured. Please use your wallet or pay at the counter.");
      setPlacing(false);
      refreshMenu();
      return;
    }

    let settled = false;
    const checkout = new window.Razorpay({
      key,
      amount: created.data.payment.amount,
      currency: created.data.payment.currency,
      name: currentCanteen.name,
      description: `FoodFlow order ${created.data.order.orderNumber}`,
      order_id: created.data.payment.razorpayOrderId,
      prefill: { name: user?.name, email: user?.email, contact: user?.phone },
      theme: { color: currentCanteen.branding?.buttonColor || "#D98236" },
      handler: async (response) => {
        settled = true;
        try {
          const verified = await paymentAPI.verify({
            orderId: created.data.order.id,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          const order = verified.data.order;
          setSuccessOrder({
            orderNumber: order.orderNumber,
            token: order.token,
            totalAmount: order.totalAmount,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
          });
          setCart([]);
          toast(verified.data.message || `Payment successful. Token ${tokenText(order.token)}.`);
          refreshMenu();
        } catch (err: unknown) {
          toast(errorMessage(err, "Payment succeeded but verification failed. Contact the canteen."));
          refreshMenu();
        } finally {
          setPlacing(false);
        }
      },
      modal: {
        ondismiss: async () => {
          if (settled) return;
          setPlacing(false);
          try {
            await paymentAPI.failed(created.data.order.id);
            toast("Payment cancelled. Your reserved items were released.");
          } catch {
            toast("Payment cancelled.");
          }
          refreshMenu();
        },
      },
    });
    checkout.open();
  };

  const placeOrder = async () => {
    if (!cart.length) return;
    if (isClosed) {
      toast("This canteen is not accepting orders right now.");
      return;
    }
    if (cartTotal < currentCanteen.settings.minOrderAmount) {
      toast(`Minimum order is ₹${currentCanteen.settings.minOrderAmount}`);
      return;
    }

    const items = cart.map((e) => ({ menuItem: e.item._id, quantity: e.quantity }));
    setPlacing(true);
    setSuccessOrder(null);

    try {
      if (paymentMethod === "ONLINE") {
        await handleOnlinePayment(items);
        return;
      }

      const res = await orderAPI.create({
        canteenId: currentCanteen._id,
        items,
        paymentMethod: "WALLET",
      });
      updateWallet(res.data.walletBalance);
      setSuccessOrder({
        orderNumber: res.data.order.orderNumber,
        token: res.data.order.token,
        totalAmount: res.data.order.totalAmount,
        paymentMethod: res.data.order.paymentMethod,
        paymentStatus: res.data.order.paymentStatus,
      });
      setCart([]);
      toast(`Order ${res.data.order.orderNumber} placed! Token ${tokenText(res.data.order.token)}.`);
      refreshMenu();
    } catch (err: unknown) {
      toast(errorMessage(err, "Failed to place order"));
      refreshMenu();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <section className="page">
      <div className="canteen-menu-header">
        <CanteenIdentity canteen={currentCanteen} compact />
        <div className="canteen-menu-status">
          <span className={`status ${isClosed ? "status-cancelled" : "status-ready"}`}>
            {isClosed ? "Closed" : "Open for orders"}
          </span>
          <small>
            {currentCanteen.settings.openingTime} – {currentCanteen.settings.closingTime} ·{" "}
            {currentCanteen.settings.preparationTime} min prep
          </small>
        </div>
      </div>

      {isClosed && (
        <div className="notice warning">
          This canteen is currently closed or not accepting new orders. You can still browse the menu.
        </div>
      )}

      {successOrder && (
        <div className="token-card">
          <div className="token-large">{tokenText(successOrder.token)}</div>
          <div className="token-meta">
            <strong>
              <CheckCircle2 size={15} color="var(--success)" /> Order {successOrder.orderNumber} confirmed
            </strong>
            <span>
              {formatCurrency(successOrder.totalAmount)} · {successOrder.paymentMethod} ·{" "}
              {successOrder.paymentStatus}
            </span>
            <span>Show this token at the counter to collect your order.</span>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="secondary" onClick={() => setSuccessOrder(null)}>
              Order more
            </button>
            <button className="primary" onClick={() => navigate("/orders")}>
              View my orders
            </button>
          </div>
        </div>
      )}

      <div className="search-bar">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search menu items…"
          className="menu-search"
        />
      </div>
      <div className="chips">
        {categories.map((cat) => (
          <button
            key={cat}
            className={activeCategory === cat ? "chip on" : "chip"}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>
      {loading ? (
        <div className="loading">Loading menu…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">No items found</div>
      ) : (
        <div className="foods">
          {filtered.map((item) => (
            <FoodCard key={item._id} item={item} onAdd={addToCart} disabled={isClosed} />
          ))}
        </div>
      )}

      {cart.length > 0 && !placing && (
        <div className="panel" style={{ marginBottom: 90 }}>
          <div className="panel-head">
            <div>
              <h2>Payment method</h2>
              <p>Wallet is deducted instantly. Online uses Razorpay and is verified on our server.</p>
            </div>
          </div>
          <div className="roles" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              className={paymentMethod === "WALLET" ? "on" : ""}
              onClick={() => setPaymentMethod("WALLET")}
            >
              <Wallet size={14} /> Wallet · ₹{user?.walletBalance ?? 0}
            </button>
            <button
              type="button"
              className={paymentMethod === "ONLINE" ? "on" : ""}
              onClick={() => setPaymentMethod("ONLINE")}
              disabled={onlineConfigured === false}
              title={onlineConfigured === false ? "Razorpay keys are not configured on the server" : undefined}
            >
              <CreditCard size={14} /> Pay online
              {onlineConfigured === false ? " (unavailable)" : ""}
            </button>
          </div>
          {paymentMethod === "ONLINE" && (
            <p className="field-hint" style={{ marginTop: 8 }}>
              You will be redirected to Razorpay to complete the payment. The order is only marked paid after the
              server verifies the signature and amount.
            </p>
          )}
        </div>
      )}

      <CartBar
        items={cart}
        onClear={clearCart}
        onPlaceOrder={placing || isClosed ? () => undefined : placeOrder}
        disabled={placing || isClosed}
        placing={placing}
      />
      {placing && <div className="loading">Processing payment…</div>}
    </section>
  );
}
