import { useState, useEffect } from "react";
import Heading from "@/components/Heading";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { menuAPI, type MenuItem } from "@/lib/api";
import { Plus, Trash2, Store } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export default function AdminMenuPage() {
  const { toast } = useToast();
  const { canteens, currentCanteen, selectCanteen } = useCanteen();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("Quick Bites");
  const [emoji, setEmoji] = useState("🍽️");
  const [description, setDescription] = useState("");
  const [adding, setAdding] = useState(false);

  const canteenId = currentCanteen?._id;

  const fetchMenu = () => {
    if (!canteenId) {
      setMenu([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    menuAPI
      .getAll({ canteenId })
      .then((r) => setMenu(r.data.items))
      .catch(() => setMenu([]))
      .finally(() => setLoading(false));
  };

  useEffect(fetchMenu, [canteenId]);

  const addItem = async () => {
    if (!canteenId) {
      toast("Select a canteen first");
      return;
    }
    if (!name || !price) {
      toast("Name and price are required");
      return;
    }
    setAdding(true);
    try {
      const res = await menuAPI.create({
        canteen: canteenId,
        name,
        price: Number(price),
        category,
        emoji,
        description,
      });
      setMenu((prev) => [...prev, res.data.item]);
      setName("");
      setPrice("");
      setDescription("");
      toast("Menu item added");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to add item");
    } finally {
      setAdding(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await menuAPI.update(item._id, { available: !item.available });
      setMenu((prev) => prev.map((i) => (i._id === item._id ? res.data.item : i)));
      toast(`${item.name} is now ${item.available ? "hidden" : "available"}`);
    } catch {
      toast("Failed to update");
    }
  };

  const deleteItem = async (item: MenuItem) => {
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await menuAPI.delete(item._id);
      setMenu((prev) => prev.filter((i) => i._id !== item._id));
      toast(`${item.name} deleted`);
    } catch {
      toast("Failed to delete");
    }
  };

  return (
    <section className="page">
      <Heading title="Menu manager" sub="Update availability and pricing for any canteen." />

      <div className="chips">
        {canteens.map((canteen) => (
          <button
            key={canteen._id}
            className={currentCanteen?._id === canteen._id ? "chip on" : "chip"}
            onClick={() => selectCanteen(canteen._id)}
          >
            {canteen.name}
          </button>
        ))}
      </div>

      {!canteenId ? (
        <div className="empty-state canteen-empty">
          <Store size={32} />
          <p>Create a canteen first to manage a menu.</p>
        </div>
      ) : (
        <div className="two">
          <div className="panel">
            <h2>Add menu item to {currentCanteen?.name}</h2>
            <p>Items are scoped to the selected canteen.</p>
            <div className="form-stack">
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Item name" />
              </label>
              <label>
                Description
                <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short description" />
              </label>
              <div className="inline">
                <label>
                  Price (₹)
                  <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" />
                </label>
                <label>
                  Category
                  <select value={category} onChange={(e) => setCategory(e.target.value)}>
                    <option>Quick Bites</option>
                    <option>Snacks</option>
                    <option>Meals</option>
                    <option>Beverages</option>
                    <option>Desserts</option>
                  </select>
                </label>
              </div>
              <label>
                Emoji
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} placeholder="🍽️" style={{ width: 90 }} />
              </label>
              <button className="primary" onClick={addItem} disabled={adding}>
                <Plus size={15} />
                {adding ? "Adding…" : "Add item"}
              </button>
            </div>
          </div>
          <div className="panel">
            <h2>Current menu ({menu.length} items)</h2>
            <div className="menu-list">
              {loading ? (
                <div className="loading">Loading…</div>
              ) : menu.length === 0 ? (
                <div className="empty-state">No items yet</div>
              ) : (
                menu.map((item) => (
                  <div key={item._id}>
                    <span className="mini-food">{item.image ? <img src={item.image} alt="" /> : item.emoji}</span>
                    <div>
                      <b>{item.name}</b>
                      <small>
                        {item.category} · {formatCurrency(item.price)}
                        {typeof item.stock === "number" ? ` · ${item.stock} stock` : ""}
                      </small>
                    </div>
                    <button className="availability" onClick={() => toggleAvailability(item)}>
                      {item.available ? "Available" : "Hidden"}
                    </button>
                    <button className="trash" onClick={() => deleteItem(item)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
