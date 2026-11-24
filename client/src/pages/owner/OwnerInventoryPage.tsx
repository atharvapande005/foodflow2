import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Boxes, Check, PackageX, Store } from "lucide-react";
import Heading from "@/components/Heading";
import Metric from "@/components/Metric";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { menuAPI, type InventorySummary, type MenuItem } from "@/lib/api";

export default function OwnerInventoryPage() {
  const { currentCanteen, loading: canteenLoading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = () => {
    if (!currentCanteen) return;
    setLoading(true);
    menuAPI
      .getInventory(currentCanteen._id)
      .then((res) => {
        setItems(res.data.items);
        setSummary(res.data.summary);
        setDrafts(
          Object.fromEntries(
            res.data.items.map((item) => [
              item._id,
              typeof item.stock === "number" ? String(item.stock) : "",
            ])
          )
        );
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  };

  useEffect(load, [currentCanteen]);

  if (canteenLoading) return <div className="loading">Loading canteen…</div>;
  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Create a canteen first</h2>
          <p>Inventory is tracked per canteen menu item.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const saveStock = async (item: MenuItem) => {
    const raw = drafts[item._id];
    setSavingId(item._id);
    try {
      const res = await menuAPI.update(item._id, {
        stock: raw === "" || raw === undefined ? null : Number(raw),
      });
      setItems((prev) => prev.map((entry) => (entry._id === item._id ? res.data.item : entry)));
      setDrafts((prev) => ({
        ...prev,
        [item._id]: typeof res.data.item.stock === "number" ? String(res.data.item.stock) : "",
      }));
      toast(`Stock updated for ${item.name}`);
      menuAPI.getInventory(currentCanteen._id).then((r) => setSummary(r.data.summary)).catch(() => undefined);
    } catch {
      toast("Failed to update stock");
    } finally {
      setSavingId(null);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await menuAPI.update(item._id, { available: !item.available });
      setItems((prev) => prev.map((entry) => (entry._id === item._id ? res.data.item : entry)));
      toast(`${item.name} is now ${item.available ? "hidden" : "available"}`);
    } catch {
      toast("Failed to update availability");
    }
  };

  return (
    <section className="page">
      <div className="canteen-menu-header">
        <CanteenIdentity canteen={currentCanteen} compact />
        <span className="status status-ready">{currentCanteen.name}</span>
      </div>
      <Heading
        title="Inventory"
        sub="Track stock, prevent sold-out items from being ordered and hide unavailable dishes."
      />

      <div className="metrics four">
        <Metric label="Menu items" value={`${summary?.totalItems ?? 0}`} Icon={Boxes} delta="Across this canteen" />
        <Metric label="Available" value={`${summary?.availableItems ?? 0}`} Icon={Check} delta="Visible to students" />
        <Metric
          label="Low stock"
          value={`${summary?.lowStock ?? 0}`}
          Icon={AlertTriangle}
          delta="At or below threshold"
        />
        <Metric
          label="Out of stock"
          value={`${summary?.outOfStock ?? 0}`}
          Icon={PackageX}
          delta="Blocked from ordering"
        />
      </div>

      {loading ? (
        <div className="loading">Loading inventory…</div>
      ) : items.length === 0 ? (
        <div className="empty-state">No menu items yet. Add items from Menu management.</div>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Stock</th>
                <th>Alert at</th>
                <th>Availability</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const stock = typeof item.stock === "number" ? item.stock : null;
                const low = stock !== null && stock > 0 && stock <= (item.lowStockThreshold || 5);
                const out = stock !== null && stock <= 0;
                return (
                  <tr key={item._id} className={out ? "row-out" : low ? "row-low" : ""}>
                    <td>
                      <b>
                        {item.image ? <img className="table-thumb" src={item.image} alt="" /> : item.emoji}{" "}
                        {item.name}
                      </b>
                      <small>{item.category}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>
                      <input
                        className="stock-input"
                        type="number"
                        min="0"
                        value={drafts[item._id] ?? ""}
                        placeholder="∞"
                        onChange={(event) =>
                          setDrafts((prev) => ({ ...prev, [item._id]: event.target.value }))
                        }
                      />
                      <small>{stock === null ? "Unlimited" : out ? "Out of stock" : low ? "Low stock" : "In stock"}</small>
                    </td>
                    <td>{item.lowStockThreshold ?? 5}</td>
                    <td>
                      <button className="availability" onClick={() => toggleAvailability(item)}>
                        {item.available ? "Available" : "Hidden"}
                      </button>
                    </td>
                    <td>
                      <button
                        className="table-btn"
                        disabled={savingId === item._id}
                        onClick={() => saveStock(item)}
                      >
                        {savingId === item._id ? "Saving…" : "Save stock"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
