import { useState, useEffect } from "react";
import Metric from "@/components/Metric";
import Heading from "@/components/Heading";
import { analyticsAPI, type DashboardStats, type Order } from "@/lib/api";
import { IndianRupee, Users, ShoppingCart, Building2 } from "lucide-react";
import { getStatusColor, formatCurrency } from "@/lib/utils";

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    analyticsAPI
      .getDashboard()
      .then((r) => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading dashboard…</div>;

  if (!stats) {
    return (
      <section className="page">
        <Heading title="Canteen overview" sub="Connect the backend to see live data." />
        <div className="empty-state">Backend not connected. Start the server to see real-time analytics.</div>
      </section>
    );
  }

  return (
    <section className="page">
      <Heading title="Canteen overview" sub="Everything you need to see the flow at a glance." />
      <div className="metrics four">
        <Metric label="Today's revenue" value={formatCurrency(stats.todayRevenue)} Icon={IndianRupee} delta={`${stats.revenueDelta} from yesterday`} />
        <Metric label="Orders today" value={`${stats.todayOrders}`} Icon={ShoppingCart} delta={`${stats.pendingOrders} pending now`} />
        <Metric label="Canteens" value={`${stats.totalCanteens ?? 0}`} Icon={Building2} delta={`${stats.totalMenuItems} menu items live`} />
        <Metric label="Active users" value={`${stats.totalUsers}`} Icon={Users} delta="Registered accounts" />
      </div>
      <div className="admin-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Recent orders</h2>
              <p>Latest canteen orders.</p>
            </div>
            {stats.pendingOrders > 0 && <span className="live">LIVE</span>}
          </div>
          {stats.recentOrders.length === 0 ? (
            <div className="empty-state">No orders yet</div>
          ) : (
            stats.recentOrders.map((o: Order) => {
              const userName =
                o.user && typeof o.user === "object" ? o.user.name : o.guestName || "Unknown";
              return (
                <div className="queue" key={o._id}>
                  <b>{o.orderNumber}</b>
                  <div>
                    <strong>{userName}</strong>
                    <small>
                      {o.canteen && typeof o.canteen === "object" ? `${o.canteen.name} · ` : ""}
                      {o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
                    </small>
                  </div>
                  <span className={`status ${getStatusColor(o.status)}`}>{o.status}</span>
                </div>
              );
            })
          )}
        </div>
        <div className="signal">
          <span className="eyebrow dark">STATUS BREAKDOWN</span>
          <h2>Order flow today</h2>
          <div className="status-list">
            {Object.entries(stats.statusBreakdown).map(([status, count]) => (
              <div key={status} className="status-row">
                <span className={`status ${getStatusColor(status)}`}>{status}</span>
                <strong>{count as number}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
