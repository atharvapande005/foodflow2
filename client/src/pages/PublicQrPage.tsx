import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, CheckCircle2, Minus, Plus, QrCode, RefreshCw, Store } from "lucide-react";
import { publicAPI, type MenuItem, type PublicCanteen, type PublicOrder } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatCurrency, getStatusColor } from "@/lib/utils";

interface PublicData {
  canteen: PublicCanteen;
  items: MenuItem[];
  session: { _id: string; openedAt: string; lastToken: number } | null;
  acceptingOrders: boolean;
}

function tokenText(token?: number | null): string {
  if (!token) return "—";
  return `#${String(token).padStart(3, "0")}`;
}

function errorMessage(err: unknown, fallback: string): string {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

const STATUS_STEPS: { key: PublicOrder["status"]; label: string }[] = [
  { key: "PLACED", label: "Placed" },
  { key: "PREPARING", label: "Preparing" },
  { key: "READY", label: "Ready" },
  { key: "COMPLETED", label: "Collected" },
];

export default function PublicQrPage() {
  const { code = "" } = useParams<{ code: string }>();
  const { user } = useAuth();

  const [data, setData] = useState<PublicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<PublicOrder | null>(null);
  const [tracked, setTracked] = useState<PublicOrder | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await publicAPI.getCanteen(code);
      setData(res.data);
    } catch (err: unknown) {
      setData(null);
      setLoadError(errorMessage(err, "This QR code is not valid or the canteen is unavailable."));
    } finally {
      setLoading(false);
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll the public status endpoint while an order is active.
  useEffect(() => {
    if (!placed) return;
    if (!tracked || tracked.status === "COMPLETED" || tracked.status === "CANCELLED") return;

    let cancelled = false;
    const tick = () => {
      publicAPI
        .trackOrder(placed.id, guestPhone || undefined)
        .then((res) => {
          if (!cancelled) setTracked(res.data.order);
        })
        .catch(() => undefined);
    };
    tick();
    const timer = window.setInterval(tick, 12000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [placed, tracked?.status, guestPhone]);

  const items = data?.items || [];
  const cart = useMemo(
    () =>
      items
        .filter((item) => (quantities[item._id] || 0) > 0)
        .map((item) => ({ item, quantity: quantities[item._id] })),
    [items, quantities]
  );
  const total = cart.reduce((sum, line) => sum + line.item.price * line.quantity, 0);
  const count = cart.reduce((sum, line) => sum + line.quantity, 0);

  if (loading) {
    return (
      <div className="public-shell">
        <div className="public-content">
          <div className="loading">Loading canteen…</div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="public-shell">
        <div className="public-content">
          <div className="empty-state" style={{ marginTop: 60 }}>
            <QrCode size={40} />
            <h2>QR code not available</h2>
            <p>{loadError}</p>
            <Link className="primary" to={user ? "/" : "/auth"}>
              Go to FoodFlow <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const { canteen } = data;
  const branding = canteen.branding;
  const canOrder = data.acceptingOrders && canteen.settings.acceptingOrders;

  const changeQuantity = (item: MenuItem, delta: number) => {
    setQuantities((prev) => {
      const current = prev[item._id] || 0;
      const max = typeof item.stock === "number" ? item.stock : 99;
      const next = Math.max(0, Math.min(max, current + delta));
      return { ...prev, [item._id]: next };
    });
  };

  const placeOrder = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!cart.length) return;
    if (!guestName.trim()) return;
    if (total < canteen.settings.minOrderAmount) return;

    setPlacing(true);
    try {
      const res = await publicAPI.createOrder({
        canteenCode: canteen.code,
        items: cart.map((line) => ({ menuItem: line.item._id, quantity: line.quantity })),
        guestName: guestName.trim(),
        guestPhone: guestPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setPlaced(res.data.order);
      setTracked(res.data.order);
      setQuantities({});
      setNotes("");
      load();
    } catch (err: unknown) {
      alert(errorMessage(err, "Could not place the order. Please try again."));
    } finally {
      setPlacing(false);
    }
  };

  const activeOrder = tracked || placed;
  const currentStep = activeOrder ? STATUS_STEPS.findIndex((step) => step.key === activeOrder.status) : -1;

  return (
    <div className="public-shell">
      {branding.backgroundUrl && (
        <div
          className="public-bg"
          style={{
            backgroundImage: `url(${branding.backgroundUrl})`,
            backgroundPosition: branding.backgroundPosition,
            backgroundSize: branding.backgroundSize || "cover",
            opacity: branding.backgroundOpacity,
          }}
        />
      )}
      <div
        className="public-overlay"
        style={{ backgroundColor: branding.overlayColor, opacity: branding.overlayOpacity }}
      />

      <div className="public-content">
        <div className="public-top">
          <span className="brand">
            <span>
              <Store size={18} />
            </span>
            <span className="brand-text">FoodFlow</span>
          </span>
          <Link className="public-link" to={user ? "/" : "/auth"}>
            {user ? "Open app" : "Sign in"} <ArrowRight size={14} />
          </Link>
        </div>

        <div className="public-canteen">
          <div className="public-canteen-head">
            {branding.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                style={{ width: 52, height: 52, borderRadius: 12, objectFit: "contain", background: "#fff" }}
              />
            ) : (
              <span className="avatar" style={{ width: 52, height: 52, borderRadius: 14, fontSize: 20 }}>
                {canteen.name.charAt(0)}
              </span>
            )}
            <div>
              <h1>{canteen.name}</h1>
              <p>{canteen.institution?.collegeName || canteen.tagline}</p>
              <span className={`public-status ${canOrder ? "positive" : "negative"}`}>
                <span className={`session-dot ${canOrder ? "open" : ""}`} />
                {canOrder ? "Accepting orders · pay at the counter" : "Orders are paused right now"}
              </span>
            </div>
            <button className="btn-small" onClick={load} style={{ marginLeft: "auto" }} title="Refresh menu">
              <RefreshCw size={13} />
            </button>
          </div>
          {canteen.announcement && <p style={{ margin: "12px 0 0", fontSize: 12 }}>{canteen.announcement}</p>}
        </div>

        {activeOrder ? (
          <div className="token-card">
            <div className="token-large">{tokenText(activeOrder.token)}</div>
            <div className="token-meta">
              <strong>
                <CheckCircle2 size={15} color="var(--success)" /> {activeOrder.orderNumber}
              </strong>
              <span>
                {formatCurrency(activeOrder.totalAmount)} · Pay {formatCurrency(activeOrder.totalAmount)} at the
                counter
              </span>
              <span className={`status ${getStatusColor(activeOrder.status)}`}>{activeOrder.status}</span>
            </div>
            <div style={{ flexBasis: "100%", marginTop: 6 }}>
              <div className="status-list" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                {STATUS_STEPS.map((step, index) => (
                  <span
                    key={step.key}
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color:
                        activeOrder.status === "CANCELLED"
                          ? "var(--error)"
                          : index <= currentStep
                            ? "var(--success)"
                            : "var(--muted)",
                    }}
                  >
                    {index < currentStep || activeOrder.status === "COMPLETED" ? "✓" : index + 1}. {step.label}
                  </span>
                ))}
              </div>
              {activeOrder.status === "CANCELLED" && (
                <p className="error" style={{ marginTop: 8 }}>
                  This order was cancelled{activeOrder.rejectionReason ? `: ${activeOrder.rejectionReason}` : "."}
                </p>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  className="secondary"
                  onClick={() => {
                    setPlaced(null);
                    setTracked(null);
                    setQuantities({});
                  }}
                >
                  Place another order
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!activeOrder && (
          <>
            {canteen.settings.minOrderAmount > 0 && (
              <p className="empty-inline">Minimum order {formatCurrency(canteen.settings.minOrderAmount)}</p>
            )}

            <div className="public-menu">
              {items.length === 0 ? (
                <div className="empty-inline">No items are available right now.</div>
              ) : (
                items.map((item) => {
                  const quantity = quantities[item._id] || 0;
                  const soldOut = typeof item.stock === "number" && item.stock <= 0;
                  return (
                    <div className="public-item" key={item._id}>
                      <span className="emoji">{item.image ? <img src={item.image} alt="" style={{ width: 32, height: 32, borderRadius: 8, objectFit: "cover" }} /> : item.emoji || "🍽️"}</span>
                      <div style={{ minWidth: 0 }}>
                        <b>{item.name}</b>
                        <small>
                          {item.category}
                          {typeof item.stock === "number" ? ` · ${item.stock} left` : ""}
                          {soldOut ? " · sold out" : ""}
                        </small>
                      </div>
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <div className="price">{formatCurrency(item.price)}</div>
                        {quantity > 0 ? (
                          <span className="qty-controls" style={{ marginTop: 4 }}>
                            <button type="button" onClick={() => changeQuantity(item, -1)}>
                              <Minus size={12} />
                            </button>
                            <span>{quantity}</span>
                            <button type="button" onClick={() => changeQuantity(item, 1)} disabled={soldOut}>
                              <Plus size={12} />
                            </button>
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="btn-small"
                            onClick={() => changeQuantity(item, 1)}
                            disabled={!canOrder || soldOut}
                            style={{ marginTop: 4 }}
                          >
                            <Plus size={12} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {cart.length > 0 && (
              <form className="public-canteen" onSubmit={placeOrder} style={{ marginTop: 16 }}>
                <h2 style={{ fontSize: 16, marginTop: 0 }}>Your details</h2>
                <div className="form-grid">
                  <label>
                    Name (required)
                    <input
                      value={guestName}
                      onChange={(event) => setGuestName(event.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </label>
                  <label>
                    Phone (optional)
                    <input
                      value={guestPhone}
                      onChange={(event) => setGuestPhone(event.target.value)}
                      placeholder="+91…"
                    />
                  </label>
                </div>
                <label>
                  Notes (optional)
                  <input
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Less spicy, extra napkins…"
                  />
                </label>
                <p className="field-hint">
                  Pay {formatCurrency(total)} in cash at the counter. A token is issued immediately.
                </p>
                <button
                  className="primary"
                  type="submit"
                  disabled={placing || !canOrder || !guestName.trim() || total < canteen.settings.minOrderAmount}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {placing ? "Placing order…" : `Place order · ${formatCurrency(total)}`}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {cart.length > 0 && !activeOrder && (
        <div className="public-cart-bar">
          <div>
            <span>
              {count} item{count === 1 ? "" : "s"} · pay at counter
            </span>
            <b>{formatCurrency(total)}</b>
          </div>
          <button
            className="primary"
            onClick={() => {
              document.querySelector(".public-content form")?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
          >
            Add details <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
