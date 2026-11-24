import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ImagePlus, Pencil, Plus, Save, Store, Trash2, X } from "lucide-react";
import Heading from "@/components/Heading";
import { CanteenIdentity } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { menuAPI, uploadAPI, type MenuItem } from "@/lib/api";
import { formatCurrency } from "@/lib/utils";

interface MenuForm {
  name: string;
  description: string;
  category: string;
  price: string;
  emoji: string;
  image: string;
  stock: string;
  defaultStock: string;
  lowStockThreshold: string;
  available: boolean;
  popular: boolean;
}

const emptyForm: MenuForm = {
  name: "",
  description: "",
  category: "Quick Bites",
  price: "",
  emoji: "🍽️",
  image: "",
  stock: "",
  defaultStock: "",
  lowStockThreshold: "5",
  available: true,
  popular: false,
};

export default function OwnerMenuPage() {
  const { currentCanteen, loading: canteenLoading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<MenuForm>(emptyForm);

  const categories = useMemo(
    () => Array.from(new Set([...categoryNames, ...menu.map((item) => item.category)])).filter(Boolean).sort(),
    [categoryNames, menu]
  );

  const loadMenu = () => {
    if (!currentCanteen) return;
    Promise.all([
      menuAPI.getAll({ canteenId: currentCanteen._id }),
      menuAPI.getCategories(currentCanteen._id),
    ])
      .then(([menuRes, categoryRes]) => {
        setMenu(menuRes.data.items);
        setCategoryNames(categoryRes.data.categories);
      })
      .catch(() => setMenu([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!currentCanteen) return;
    setLoading(true);
    loadMenu();
  }, [currentCanteen]);

  if (canteenLoading) return <div className="loading">Loading canteen…</div>;
  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Create a canteen first</h2>
          <p>Menu items belong to a canteen. Set up your canteen to start adding dishes.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const setField = <K extends keyof MenuForm>(key: K, value: MenuForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm({ ...emptyForm, category: categories[0] || "Quick Bites" });
    setEditingId(null);
  };

  const startEdit = (item: MenuItem) => {
    setEditingId(item._id);
    setForm({
      name: item.name,
      description: item.description || "",
      category: item.category,
      price: String(item.price),
      emoji: item.emoji || "🍽️",
      image: item.image || "",
      stock: typeof item.stock === "number" ? String(item.stock) : "",
      defaultStock:
        typeof item.defaultStock === "number"
          ? String(item.defaultStock)
          : typeof item.stock === "number"
            ? String(item.stock)
            : "",
      lowStockThreshold: String(item.lowStockThreshold ?? 5),
      available: item.available,
      popular: item.popular,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.price) {
      toast("Name and price are required");
      return;
    }

    const defaultStock = form.defaultStock === "" ? null : Number(form.defaultStock);
    const payload: Partial<MenuItem> & { canteen?: string } = {
      canteen: currentCanteen._id,
      name: form.name.trim(),
      description: form.description,
      category: form.category.trim() || "Quick Bites",
      price: Number(form.price),
      emoji: form.emoji || "🍽️",
      image: form.image || undefined,
      stock: form.stock === "" ? (editingId ? null : defaultStock) : Number(form.stock),
      defaultStock,
      lowStockThreshold: Number(form.lowStockThreshold) || 5,
      available: form.available,
      popular: form.popular,
    };

    setSaving(true);
    try {
      if (editingId) {
        await menuAPI.update(editingId, payload);
        toast("Menu item updated");
      } else {
        await menuAPI.create(payload);
        toast("Menu item added");
      }
      resetForm();
      loadMenu();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to save menu item");
    } finally {
      setSaving(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      const res = await menuAPI.update(item._id, { available: !item.available });
      setMenu((prev) => prev.map((entry) => (entry._id === item._id ? res.data.item : entry)));
      toast(`${item.name} is now ${item.available ? "hidden" : "available"}`);
    } catch {
      toast("Failed to update availability");
    }
  };

  const remove = async (item: MenuItem) => {
    if (!window.confirm(`Delete ${item.name} from this canteen's menu?`)) return;
    try {
      await menuAPI.delete(item._id);
      setMenu((prev) => prev.filter((entry) => entry._id !== item._id));
      toast(`${item.name} deleted`);
    } catch {
      toast("Failed to delete item");
    }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Images must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadAPI.image(file, "menu");
      setField("image", res.data.url);
      toast("Item photo uploaded — save to apply");
    } catch {
      toast("Image upload failed");
    } finally {
      setUploading(false);
    }
  };

  const addCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = newCategory.trim();
    if (!name) {
      toast("Enter a category name");
      return;
    }
    try {
      await menuAPI.createCategory(name, currentCanteen._id);
      setNewCategory("");
      loadMenu();
      toast(`Category "${name}" added`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to add category");
    }
  };

  const renameCategory = async (name: string) => {
    const next = window.prompt(`Rename category "${name}" to:`, name);
    if (!next || !next.trim() || next.trim() === name) return;
    try {
      const res = await menuAPI.renameCategory(name, next.trim(), currentCanteen._id);
      toast(`Category renamed. ${res.data.updatedItems} item(s) updated.`);
      loadMenu();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to rename category");
    }
  };

  const removeCategory = async (name: string) => {
    const count = menu.filter((item) => item.category === name).length;
    let reassignTo: string | undefined;
    if (count > 0) {
      const fallback = categories.find((category) => category !== name) || "";
      const answer = window.prompt(
        `"${name}" has ${count} item(s). Enter another category to move them to, or leave blank to cancel.`,
        fallback
      );
      if (!answer || !answer.trim()) return;
      reassignTo = answer.trim();
    } else if (!window.confirm(`Delete the empty category "${name}"?`)) {
      return;
    }

    try {
      const res = await menuAPI.deleteCategory(name, currentCanteen._id, reassignTo);
      toast(
        res.data.movedItems
          ? `Category deleted. ${res.data.movedItems} item(s) moved to ${reassignTo}.`
          : "Category deleted"
      );
      loadMenu();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to delete category");
    }
  };

  return (
    <section className="page">
      <div className="canteen-menu-header">
        <CanteenIdentity canteen={currentCanteen} compact />
        <span className="status status-ready">{menu.length} items</span>
      </div>
      <Heading title="Menu management" sub={`Update prices, availability and photos for ${currentCanteen.name}.`} />

      <div className="two menu-admin-grid">
        <form className="panel" onSubmit={submit}>
          <div className="panel-head">
            <div>
              <h2>{editingId ? "Edit menu item" : "Add menu item"}</h2>
              <p>Only this canteen's menu is affected.</p>
            </div>
            {editingId ? (
              <button type="button" className="icon" onClick={resetForm} aria-label="Cancel edit">
                <X size={16} />
              </button>
            ) : (
              <Plus size={20} />
            )}
          </div>

          <div className="form-grid">
            <label>
              Item name
              <input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Item name" />
            </label>
            <label>
              Price (₹)
              <input
                type="number"
                min="0"
                step="0.5"
                value={form.price}
                onChange={(event) => setField("price", event.target.value)}
                placeholder="0"
              />
            </label>
            <label>
              Category
              <input
                value={form.category}
                onChange={(event) => setField("category", event.target.value)}
                placeholder="Quick Bites"
                list="owner-categories"
              />
              <datalist id="owner-categories">
                {categories.map((category) => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </label>
            <label>
              Stock (blank = unlimited)
              <input
                type="number"
                min="0"
                value={form.stock}
                onChange={(event) => setField("stock", event.target.value)}
                placeholder="Unlimited"
              />
            </label>
            <label>
              Daily prep quantity
              <input
                type="number"
                min="0"
                value={form.defaultStock}
                onChange={(event) => setField("defaultStock", event.target.value)}
                placeholder="Restored when session starts"
              />
            </label>
            <label>
              Low-stock alert at
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(event) => setField("lowStockThreshold", event.target.value)}
              />
            </label>
          </div>

          <label>
            Description
            <textarea
              rows={2}
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Short description"
            />
          </label>

          <div className="form-grid">
            <label>
              Emoji
              <input value={form.emoji} onChange={(event) => setField("emoji", event.target.value)} placeholder="🍽️" />
            </label>
            <label>
              Item photo
              <span className="upload-inline">
                <label className="secondary upload-label small">
                  <ImagePlus size={14} />
                  {uploading ? "Uploading…" : form.image ? "Replace photo" : "Upload photo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={(event) => uploadPhoto(event.target.files?.[0])}
                    disabled={uploading}
                  />
                </label>
                {form.image && (
                  <button type="button" className="danger-ghost" onClick={() => setField("image", "")}>
                    Remove
                  </button>
                )}
              </span>
            </label>
          </div>

          <div className="checkbox-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.available}
                onChange={(event) => setField("available", event.target.checked)}
              />
              Available for ordering
            </label>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.popular}
                onChange={(event) => setField("popular", event.target.checked)}
              />
              Mark as popular
            </label>
          </div>

          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving || uploading}>
              <Save size={15} /> {saving ? "Saving…" : editingId ? "Save item" : "Add item"}
            </button>
          </div>
        </form>

        <div className="panel">
          <h2>Current menu ({menu.length})</h2>
          <p>Manage availability from here. Stock levels live in Inventory.</p>
          <div className="menu-list">
            {loading ? (
              <div className="loading">Loading…</div>
            ) : menu.length === 0 ? (
              <div className="empty-state">No menu items yet</div>
            ) : (
              menu.map((item) => (
                <div key={item._id}>
                  <span className="mini-food">
                    {item.image ? <img src={item.image} alt="" /> : item.emoji}
                  </span>
                  <div>
                    <b>{item.name}</b>
                    <small>
                      {item.category} · {formatCurrency(item.price)}
                      {typeof item.stock === "number" ? ` · ${item.stock} in stock` : ""}
                    </small>
                  </div>
                  <button className="availability" onClick={() => toggleAvailability(item)}>
                    {item.available ? "Available" : "Hidden"}
                  </button>
                  <button className="table-btn" onClick={() => startEdit(item)} title="Edit item">
                    <Pencil size={14} />
                  </button>
                  <button className="trash" onClick={() => remove(item)} title="Delete item">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 18 }}>
        <div className="panel-head">
          <div>
            <h2>Categories</h2>
            <p>Create categories first, then assign items. Renaming a category updates its items automatically.</p>
          </div>
        </div>

        <form onSubmit={addCategory} className="filter-inline" style={{ marginBottom: 12 }}>
          <label style={{ flex: 1 }}>
            New category
            <input
              value={newCategory}
              onChange={(event) => setNewCategory(event.target.value)}
              placeholder="e.g. Breakfast"
            />
          </label>
          <button className="secondary" type="submit">
            <Plus size={14} /> Add category
          </button>
        </form>

        <div className="menu-list">
          {categories.length === 0 ? (
            <div className="empty-inline">No categories yet.</div>
          ) : (
            categories.map((category) => (
              <div key={category}>
                <span className="mini-food">🏷️</span>
                <div>
                  <b>{category}</b>
                  <small>{menu.filter((item) => item.category === category).length} item(s)</small>
                </div>
                <button className="table-btn" onClick={() => renameCategory(category)} title="Rename category">
                  <Pencil size={14} />
                </button>
                <button className="trash" onClick={() => removeCategory(category)} title="Delete category">
                  <Trash2 size={15} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
