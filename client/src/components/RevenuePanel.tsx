import { useCallback, useEffect, useState } from "react";
import { IndianRupee, RefreshCw, TrendingUp } from "lucide-react";
import Heading from "@/components/Heading";
import { revenueAPI, type OperatingSession, type RevenueData } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface CanteenRevenueRow {
  canteenId: string;
  name: string;
  code: string;
  total: number;
  orders: number;
  cash: number;
  online: number;
  wallet: number;
}

interface RevenuePanelProps {
  title: string;
  sub: string;
  canteenId?: string | null;
  admin?: boolean;
}

export default function RevenuePanel({ title, sub, canteenId, admin = false }: RevenuePanelProps) {
  const [data, setData] = useState<RevenueData | null>(null);
  const [sessions, setSessions] = useState<OperatingSession[]>([]);
  const [canteens, setCanteens] = useState<CanteenRevenueRow[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        canteenId: canteenId || undefined,
        from: from || undefined,
        to: to || undefined,
      };
      const [revenueRes, sessionRes, canteenRes] = await Promise.all([
        revenueAPI.get(params),
        canteenId ? revenueAPI.sessions(canteenId) : Promise.resolve(null),
        admin ? revenueAPI.canteens({ from: from || undefined, to: to || undefined }) : Promise.resolve(null),
      ]);
      setData(revenueRes.data);
      setSessions(sessionRes?.data.sessions || []);
      setCanteens(canteenRes?.data.canteens || []);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(message || "Failed to load revenue");
    } finally {
      setLoading(false);
    }
  }, [canteenId, admin, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  const maxDaily = Math.max(1, ...(data?.daily.map((day) => day.total) || [1]));

  return (
    <section className="page">
      <Heading title={title} sub={sub} />

      <div className="filter-inline">
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <button className="secondary" onClick={() => { setFrom(""); setTo(""); }}>
          All time
        </button>
        <button className="secondary" onClick={load} disabled={loading}>
          <RefreshCw size={14} /> {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="revenue-grid">
        <div className="revenue-box cash">
          <span>Cash collected</span>
          <b>{formatCurrency(data?.revenue.cash ?? 0)}</b>
        </div>
        <div className="revenue-box online">
          <span>Online paid</span>
          <b>{formatCurrency(data?.revenue.online ?? 0)}</b>
        </div>
        <div className="revenue-box wallet">
          <span>Wallet paid</span>
          <b>{formatCurrency(data?.revenue.wallet ?? 0)}</b>
        </div>
        <div className="revenue-box total">
          <span>Total revenue</span>
          <b>{formatCurrency(data?.revenue.total ?? 0)}</b>
        </div>
      </div>

      <div className="cash-summary">
        <div>
          <span>Orders</span>
          <b>{data?.counts.totalOrders ?? 0}</b>
        </div>
        <div>
          <span>Completed</span>
          <b>{data?.counts.completed ?? 0}</b>
        </div>
        <div>
          <span>Pending</span>
          <b>{data?.counts.pending ?? 0}</b>
        </div>
        <div>
          <span>Cancelled</span>
          <b>{data?.counts.cancelled ?? 0}</b>
        </div>
      </div>

      <div className="admin-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Revenue by day</h2>
              <p>Paid orders only. Cancelled and failed payments are excluded.</p>
            </div>
            <TrendingUp size={18} />
          </div>
          {!data?.daily.length ? (
            <div className="empty-inline">No paid orders in this period.</div>
          ) : (
            data.daily.map((day) => (
              <div className="bar-row" key={day.date}>
                <span>{day.date.slice(5)}</span>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${Math.max(2, (day.total / maxDaily) * 100)}%` }} />
                </div>
                <span style={{ textAlign: "right" }}>{formatCurrency(day.total)}</span>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Payment split</h2>
              <p>Cash, online and wallet are always reported separately.</p>
            </div>
            <IndianRupee size={18} />
          </div>
          {(["CASH", "ONLINE", "WALLET"] as const).map((method) => {
            const row = data?.byMethod[method] || { total: 0, orders: 0 };
            return (
              <div className="status-row" key={method}>
                <span>{method === "CASH" ? "Cash" : method === "ONLINE" ? "Online (Razorpay)" : "Wallet"}</span>
                <strong>
                  {formatCurrency(row.total)} <small>({row.orders})</small>
                </strong>
              </div>
            );
          })}
        </div>
      </div>

      {canteenId && (
        <div className="panel" style={{ marginTop: 18 }}>
          <div className="panel-head">
            <div>
              <h2>Operating sessions</h2>
              <p>Token sequences reset per session. Sessions are never deleted.</p>
            </div>
          </div>
          {!sessions.length ? (
            <div className="empty-inline">No sessions yet. Start the canteen to begin a session.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Opened</th>
                    <th>Closed</th>
                    <th>Status</th>
                    <th>Tokens</th>
                    <th>Orders</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session._id}>
                      <td>{new Date(session.openedAt).toLocaleString()}</td>
                      <td>{session.closedAt ? new Date(session.closedAt).toLocaleString() : "—"}</td>
                      <td>
                        <span className={`status ${session.status === "OPEN" ? "status-ready" : "status-completed"}`}>
                          {session.status}
                        </span>
                      </td>
                      <td>#{String(session.tokenCounter).padStart(3, "0")}</td>
                      <td>{session.orders ?? 0}</td>
                      <td>{formatCurrency(session.revenue ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="admin-grid" style={{ marginTop: 18 }}>
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Top items</h2>
              <p>By quantity sold in this period.</p>
            </div>
          </div>
          {!data?.topItems.length ? (
            <div className="empty-inline">No item sales in this period.</div>
          ) : (
            data.topItems.map((item) => (
              <div className="status-row" key={item.name}>
                <span>
                  {item.name} <small>× {item.quantity}</small>
                </span>
                <strong>{formatCurrency(item.revenue)}</strong>
              </div>
            ))
          )}
        </div>

        {admin && (
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Revenue by canteen</h2>
                <p>Platform-wide breakdown for administrators.</p>
              </div>
            </div>
            {!canteens.length ? (
              <div className="empty-inline">No canteen revenue in this period.</div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Canteen</th>
                      <th>Cash</th>
                      <th>Online</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {canteens.map((row) => (
                      <tr key={row.canteenId}>
                        <td>
                          <b>{row.name}</b>
                          <small>{row.code}</small>
                        </td>
                        <td>{formatCurrency(row.cash)}</td>
                        <td>{formatCurrency(row.online)}</td>
                        <td>{formatCurrency(row.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
