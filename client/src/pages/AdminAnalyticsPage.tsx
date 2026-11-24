import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import Metric from "@/components/Metric";
import { analyticsAPI } from "@/lib/api";
import { IndianRupee, PackageCheck, Users } from "lucide-react";

interface SalesData {
  dailySales: { _id: string; revenue: number; orders: number }[];
  topItems: { _id: string; totalQuantity: number; totalRevenue: number }[];
  paymentMethodStats: { _id: string; count: number; total: number }[];
  period: number;
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<SalesData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  useEffect(() => {
    setLoading(true);
    analyticsAPI
      .getSales(days)
      .then((r) => setData(r.data as SalesData))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) return <div className="loading">Loading analytics…</div>;

  return (
    <section className="page">
      <Heading title="Canteen analytics" sub="A clean snapshot of your canteen performance." />
      <div className="chips">
        {[7, 14, 30].map((d) => (
          <button key={d} className={days === d ? "chip on" : "chip"} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
      </div>
      {data ? (
        <>
          <div className="metrics four">
            <Metric label="Period revenue" value={`₹${data.dailySales.reduce((s, d) => s + d.revenue, 0).toLocaleString()}`} Icon={IndianRupee} delta={`Last ${days} days`} />
            <Metric label="Total orders" value={`${data.dailySales.reduce((s, d) => s + d.orders, 0)}`} Icon={PackageCheck} delta={`Across ${days} days`} />
            <Metric label="Top item" value={data.topItems[0]?._id || "N/A"} Icon={PackageCheck} delta={data.topItems[0] ? `${data.topItems[0].totalQuantity} sold` : "No data"} />
            <Metric label="Payment methods" value={`${data.paymentMethodStats.length}`} Icon={Users} delta="Active methods" />
          </div>
          <div className="two">
            <div className="panel">
              <h2>Daily revenue</h2>
              {data.dailySales.length > 0 ? (
                <div className="bars">
                  {data.dailySales.map((d) => (
                    <div key={d._id}>
                      <span
                        style={{
                          height: `${(d.revenue / Math.max(...data.dailySales.map((x) => x.revenue), 1)) * 100}%`,
                        }}
                      />
                      <small>{d._id.slice(5)}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No data for this period</div>
              )}
            </div>
            <div className="panel">
              <h2>Top selling items</h2>
              {data.topItems.length > 0 ? (
                <div className="menu-list">
                  {data.topItems.map((item, i) => (
                    <div key={item._id}>
                      <b>#{i + 1}</b>
                      <div>
                        <b>{item._id}</b>
                        <small>{item.totalQuantity} sold · ₹{item.totalRevenue.toLocaleString()}</small>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">No sales data yet</div>
              )}
            </div>
          </div>
          <div className="panel">
            <h2>Payment method breakdown</h2>
            {data.paymentMethodStats.length > 0 ? (
              <div className="menu-list">
                {data.paymentMethodStats.map((pm) => (
                  <div key={pm._id}>
                    <span className="mini-food">{pm._id === "WALLET" ? "💰" : "💵"}</span>
                    <div>
                      <b>{pm._id}</b>
                      <small>{pm.count} orders · ₹{pm.total.toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">No payment data</div>
            )}
          </div>
        </>
      ) : (
        <div className="empty-state">Connect the backend to see analytics data.</div>
      )}
    </section>
  );
}
