import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Boxes,
  IndianRupee,
  Menu as MenuIcon,
  PackageCheck,
  Palette,
  Settings,
  Store,
  Users,
} from "lucide-react";
import Metric from "@/components/Metric";
import SessionBar from "@/components/SessionBar";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useCanteen } from "@/lib/canteen";
import { analyticsAPI, orderAPI, type DashboardStats, type OrderSummary } from "@/lib/api";
import { formatCurrency, getStatusColor, timeAgo } from "@/lib/utils";

export default function OwnerOverviewPage() {
  const { currentCanteen, canteens, loading: canteenLoading } = useCanteen();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [summary, setSummary] = useState<OrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const refreshOverview = useCallback(() => {
    if (!currentCanteen) {
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all([
      analyticsAPI.getDashboard(currentCanteen._id),
      orderAPI.getSummary(currentCanteen._id),
    ])
      .then(([statsRes, summaryRes]) => {
        setStats(statsRes.data);
        setSummary(summaryRes.data);
      })
      .catch(() => {
        setStats(null);
        setSummary(null);
      })
      .finally(() => setLoading(false));
  }, [currentCanteen]);

  useEffect(() => {
    refreshOverview();
  }, [refreshOverview]);

  if (canteenLoading || loading) return <div className="loading">Loading your canteen…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={36} />
          <h2>Create your first canteen</h2>
          <p>
            {canteens.length === 0
              ? "Set up your canteen profile, branding and menu to start accepting orders."
              : "Select a canteen from the sidebar to continue."}
          </p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen <ArrowRight size={15} />
          </button>
        </div>
      </section>
    );
  }

  const isOpen = currentCanteen.isActive && currentCanteen.settings.acceptingOrders;

  return (
    <section className="page">
      <div className="owner-welcome">
        <CanteenIdentity canteen={currentCanteen} />
        <div className="owner-welcome-actions">
          <span className={`status ${isOpen ? "status-ready" : "status-cancelled"}`}>
            {isOpen ? "Open for orders" : "Orders paused"}
          </span>
          <Link to="/owner/branding" className="ghost light">
            <Palette size={15} /> Customise branding
          </Link>
        </div>
      </div>

      {canteens.length > 1 && (
        <div className="notice info">
          You manage {canteens.length} canteens. Use the canteen switcher in the sidebar to change scope.
        </div>
      )}

      <SessionBar canteenId={currentCanteen._id} onChanged={refreshOverview} />

      <div className="metrics four">
        <Metric
          label="Total orders"
          value={`${summary?.total ?? stats?.totalOrders ?? 0}`}
          Icon={PackageCheck}
          delta={`${summary?.pending ?? stats?.pendingOrders ?? 0} waiting now`}
        />
        <Metric
          label="Completed"
          value={`${summary?.completed ?? 0}`}
          Icon={PackageCheck}
          delta={`${summary?.ready ?? 0} ready for pickup`}
        />
        <Metric
          label="Revenue"
          value={formatCurrency(summary?.revenue ?? 0)}
          Icon={IndianRupee}
          delta={`Cash ${formatCurrency(summary?.cashRevenue ?? 0)} · Online ${formatCurrency(summary?.onlineRevenue ?? 0)}`}
        />
        <Metric
          label="Menu items"
          value={`${stats?.totalMenuItems ?? 0}`}
          Icon={MenuIcon}
          delta={`${stats?.totalUsers ?? 0} customers served`}
        />
      </div>

      <div className="quick-actions">
        <Link to="/owner/menu" className="quick-action">
          <MenuIcon size={18} />
          <div>
            <b>Manage menu</b>
            <span>Items, prices and availability</span>
          </div>
          <ArrowRight size={15} />
        </Link>
        <Link to="/owner/orders" className="quick-action">
          <PackageCheck size={18} />
          <div>
            <b>Order queue</b>
            <span>Accept, prepare and complete</span>
          </div>
          <ArrowRight size={15} />
        </Link>
        <Link to="/owner/inventory" className="quick-action">
          <Boxes size={18} />
          <div>
            <b>Inventory</b>
            <span>Stock levels and alerts</span>
          </div>
          <ArrowRight size={15} />
        </Link>
        <Link to="/owner/settings" className="quick-action">
          <Settings size={18} />
          <div>
            <b>Settings</b>
            <span>Hours and order acceptance</span>
          </div>
          <ArrowRight size={15} />
        </Link>
      </div>

      <div className="admin-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest orders for {currentCanteen.name}.</p>
            </div>
            {(summary?.pending ?? 0) > 0 && <span className="live">LIVE</span>}
          </div>
          {!summary?.recentOrders?.length ? (
            <div className="empty-state">No orders yet</div>
          ) : (
            summary.recentOrders.map((order) => {
              const userName =
                order.user && typeof order.user === "object"
                  ? order.user.name
                  : order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest");
              return (
                <div className="queue" key={order._id}>
                  <b>{order.token ? `#${String(order.token).padStart(3, "0")}` : order.orderNumber}</b>
                  <div>
                    <strong>{userName}</strong>
                    <small>
                      {order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                    </small>
                  </div>
                  <span className={`status ${getStatusColor(order.status)}`}>{order.status}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="signal">
          <span className="eyebrow dark">CANTEEN AT A GLANCE</span>
          <h2>{currentCanteen.name}</h2>
          <p>{currentCanteen.institution?.collegeName || "Campus canteen"}</p>
          <div className="status-list">
            <div className="status-row">
              <span>Status</span>
              <strong>{isOpen ? "Open" : "Closed"}</strong>
            </div>
            <div className="status-row">
              <span>Operating hours</span>
              <strong>
                {currentCanteen.settings.openingTime} – {currentCanteen.settings.closingTime}
              </strong>
            </div>
            <div className="status-row">
              <span>Preparation time</span>
              <strong>{currentCanteen.settings.preparationTime} min</strong>
            </div>
            <div className="status-row">
              <span>Ordering</span>
              <strong>{summary?.placed ?? 0} new</strong>
            </div>
            <div className="status-row">
              <span>Cash revenue</span>
              <strong>{formatCurrency(summary?.cashRevenue ?? 0)}</strong>
            </div>
            <div className="status-row">
              <span>Online revenue</span>
              <strong>{formatCurrency(summary?.onlineRevenue ?? 0)}</strong>
            </div>
          </div>
          <Link to="/owner/canteen" className="ghost light full-width">
            <Store size={15} /> Edit canteen profile
          </Link>
        </div>
      </div>

      {stats?.recentOrders?.length ? (
        <div className="section-title second">
          <h2>Platform activity</h2>
          <p>All canteens you manage.</p>
        </div>
      ) : null}
      {stats?.recentOrders?.length ? (
        <div className="orders">
          {stats.recentOrders.slice(0, 4).map((order) => (
            <div className="order" key={order._id}>
              <div className="order-main">
                <b className="order-id">{order.orderNumber}</b>
                <div>
                  <strong>{order.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}</strong>
                  <span>
                    {order.user && typeof order.user === "object"
                      ? order.user.name
                      : order.guestName || (order.orderSource === "COUNTER" ? "Counter sale" : "Guest")}{" "}
                    · {timeAgo(order.createdAt)}
                  </span>
                </div>
              </div>
              <div className="order-side">
                <strong>{formatCurrency(order.totalAmount)}</strong>
                <span className={`status ${getStatusColor(order.status)}`}>{order.status}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div className="owner-footer-note">
        <Users size={15} /> Owner data is isolated: this dashboard only includes orders and menu items belonging to your
        canteen.
      </div>
    </section>
  );
}
