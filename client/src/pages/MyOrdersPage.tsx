import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import OrderCard from "@/components/OrderCard";
import { useCanteen } from "@/lib/canteen";
import { orderAPI, type Order } from "@/lib/api";

export default function MyOrdersPage() {
  const { currentCanteen } = useCanteen();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"ALL" | "CURRENT">("ALL");

  useEffect(() => {
    setLoading(true);
    const canteenId = filter === "CURRENT" ? currentCanteen?._id : undefined;
    const opts = canteenId ? { canteenId } : undefined;
    orderAPI
      .getMyOrders(opts)
      .then((r) => setOrders(r.data.orders))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter, currentCanteen]);

  return (
    <section className="page">
      <Heading title="My orders" sub="Track your canteen orders across the whole campus." />
      <div className="chips">
        <button className={filter === "ALL" ? "chip on" : "chip"} onClick={() => setFilter("ALL")}>
          All canteens
        </button>
        <button
          className={filter === "CURRENT" ? "chip on" : "chip"}
          onClick={() => setFilter("CURRENT")}
          disabled={!currentCanteen}
        >
          {currentCanteen?.name || "This canteen"}
        </button>
      </div>
      {loading ? (
        <div className="loading">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">No orders yet. Place your first order from the menu!</div>
      ) : (
        <div className="orders">
          {orders.map((o) => (
            <OrderCard key={o._id} order={o} />
          ))}
        </div>
      )}
    </section>
  );
}
