import { useEffect, useState } from "react";
import { Building2, Plus, Save, Search, Trash2, UserRound } from "lucide-react";
import Heading from "@/components/Heading";
import Metric from "@/components/Metric";
import { CanteenLogo } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { canteenAPI, userAPI, type Canteen, type User } from "@/lib/api";

interface AdminCanteenForm {
  name: string;
  code: string;
  description: string;
  category: string;
  tagline: string;
  collegeName: string;
  contactEmail: string;
  contactPhone: string;
  ownerId: string;
  isActive: boolean;
}

const emptyForm: AdminCanteenForm = {
  name: "",
  code: "",
  description: "",
  category: "Multi-cuisine",
  tagline: "",
  collegeName: "",
  contactEmail: "",
  contactPhone: "",
  ownerId: "",
  isActive: true,
};

export default function AdminCanteensPage() {
  const { toast } = useToast();
  const [canteens, setCanteens] = useState<Canteen[]>([]);
  const [owners, setOwners] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<Canteen[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Canteen | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<AdminCanteenForm>(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([canteenAPI.list(), userAPI.getOwners()])
      .then(([canteenRes, ownerRes]) => {
        setCanteens(canteenRes.data.canteens);
        setOwners(ownerRes.data.owners);
      })
      .catch(() => {
        setCanteens([]);
        setOwners([]);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  useEffect(() => {
    const term = search.toLowerCase();
    setFiltered(
      canteens.filter(
        (canteen) =>
          canteen.name.toLowerCase().includes(term) ||
          canteen.code.toLowerCase().includes(term) ||
          canteen.institution?.collegeName?.toLowerCase().includes(term)
      )
    );
  }, [canteens, search]);

  const selectForEdit = (canteen: Canteen) => {
    setSelected(canteen);
    setCreating(false);
    setForm({
      name: canteen.name,
      code: canteen.code,
      description: canteen.description || "",
      category: canteen.category || "Multi-cuisine",
      tagline: canteen.tagline || "",
      collegeName: canteen.institution?.collegeName || "",
      contactEmail: canteen.contact?.email || "",
      contactPhone: canteen.contact?.phone || "",
      ownerId:
        canteen.ownerId && typeof canteen.ownerId === "object"
          ? canteen.ownerId.id || canteen.ownerId._id || ""
          : canteen.ownerId || "",
      isActive: canteen.isActive,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const startCreate = () => {
    setSelected(null);
    setCreating(true);
    setForm(emptyForm);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast("Canteen name and code are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        description: form.description,
        category: form.category,
        tagline: form.tagline,
        institution: { collegeName: form.collegeName },
        contact: { email: form.contactEmail, phone: form.contactPhone },
        ownerId: form.ownerId || null,
        isActive: form.isActive,
      };

      if (creating) {
        await canteenAPI.create(payload);
        toast("Canteen created");
      } else if (selected) {
        await canteenAPI.update(selected._id, payload);
        toast("Canteen updated");
      }
      setCreating(false);
      setSelected(null);
      setForm(emptyForm);
      load();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to save canteen");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (canteen: Canteen) => {
    try {
      const res = await canteenAPI.setActive(canteen._id, !canteen.isActive);
      setCanteens((prev) => prev.map((entry) => (entry._id === canteen._id ? res.data.canteen : entry)));
      toast(`${canteen.name} ${res.data.canteen.isActive ? "activated" : "deactivated"}`);
    } catch {
      toast("Failed to update canteen status");
    }
  };

  const remove = async (canteen: Canteen) => {
    if (!window.confirm(`Delete ${canteen.name}? Its menu items will be removed. Historical orders are retained.`)) {
      return;
    }
    try {
      await canteenAPI.remove(canteen._id);
      setCanteens((prev) => prev.filter((entry) => entry._id !== canteen._id));
      if (selected?._id === canteen._id) {
        setSelected(null);
        setForm(emptyForm);
      }
      toast(`${canteen.name} deleted`);
    } catch {
      toast("Failed to delete canteen");
    }
  };

  const ownerName = (canteen: Canteen) => {
    if (canteen.ownerId && typeof canteen.ownerId === "object") return canteen.ownerId.name;
    return "Unassigned";
  };

  return (
    <section className="page">
      <div className="page-title-row">
        <Heading
          title="Canteen management"
          sub="Inspect, create, edit and activate any canteen on the platform."
        />
        <button className="primary" onClick={startCreate}>
          <Plus size={15} /> New canteen
        </button>
      </div>

      <div className="metrics four">
        <Metric label="Total canteens" value={`${canteens.length}`} Icon={Building2} delta="Across the platform" />
        <Metric
          label="Active canteens"
          value={`${canteens.filter((c) => c.isActive).length}`}
          Icon={Building2}
          delta="Visible to students"
        />
        <Metric label="Owners" value={`${owners.length}`} Icon={UserRound} delta="Registered canteen owners" />
        <Metric
          label="Accepting orders"
          value={`${canteens.filter((c) => c.settings?.acceptingOrders && c.isActive).length}`}
          Icon={Building2}
          delta="Live right now"
        />
      </div>

      <div className="search-bar canteen-search">
        <Search size={17} />
        <input
          className="menu-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search canteens by name, code or college…"
        />
      </div>

      <div className="two admin-canteen-grid">
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Canteen</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={4}>
                    <div className="loading">Loading canteens…</div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={4}>
                    <div className="empty-state">No canteens found.</div>
                  </td>
                </tr>
              ) : (
                filtered.map((canteen) => (
                  <tr key={canteen._id}>
                    <td>
                      <div className="canteen-table-cell">
                        <CanteenLogo canteen={canteen} size={38} />
                        <div>
                          <b>{canteen.name}</b>
                          <small>
                            {canteen.code} · {canteen.institution?.collegeName || "No college"}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>{ownerName(canteen)}</td>
                    <td>
                      <span className={`status ${canteen.isActive ? "status-ready" : "status-cancelled"}`}>
                        {canteen.isActive ? "Active" : "Inactive"}
                      </span>
                      <small>{canteen.settings?.acceptingOrders ? "Accepting orders" : "Orders paused"}</small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="table-btn" onClick={() => selectForEdit(canteen)}>
                          Edit
                        </button>
                        <button className="table-btn" onClick={() => toggleActive(canteen)}>
                          {canteen.isActive ? "Deactivate" : "Activate"}
                        </button>
                        <button className="trash" onClick={() => remove(canteen)} title="Delete canteen">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <form className="panel" onSubmit={save}>
          <div className="panel-head">
            <div>
              <h2>{creating ? "Create canteen" : selected ? "Edit canteen" : "Select a canteen"}</h2>
              <p>
                {creating
                  ? "Administrators can create a canteen and assign an owner."
                  : selected
                    ? `Editing ${selected.name}`
                    : "Choose a canteen from the list to inspect or edit it."}
              </p>
            </div>
            <Building2 size={20} />
          </div>

          {selected && (
            <div
              className="admin-brand-strip"
              style={{
                background:
                  selected.branding?.backgroundUrl
                    ? `url(${selected.branding.backgroundUrl}) center/cover`
                    : `linear-gradient(135deg, ${selected.branding?.secondaryColor}, ${selected.branding?.primaryColor})`,
              }}
            >
              <div
                className="admin-brand-overlay"
                style={{
                  background: selected.branding?.overlayColor,
                  opacity: selected.branding?.overlayOpacity,
                }}
              />
              <CanteenLogo canteen={selected} size={42} />
              <div>
                <b>{selected.name}</b>
                <small>{selected.branding?.backgroundUrl ? "Custom background" : "Default background"}</small>
              </div>
            </div>
          )}

          {(creating || selected) && (
            <>
              <div className="form-grid">
                <label>
                  Canteen name
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </label>
                <label>
                  Canteen code
                  <input
                    value={form.code}
                    onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                    required
                  />
                </label>
                <label>
                  Category
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </label>
                <label>
                  College / university
                  <input
                    value={form.collegeName}
                    onChange={(e) => setForm({ ...form, collegeName: e.target.value })}
                  />
                </label>
                <label>
                  Contact email
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                  />
                </label>
                <label>
                  Contact phone
                  <input
                    value={form.contactPhone}
                    onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                  />
                </label>
              </div>
              <label>
                Tagline
                <input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} />
              </label>
              <label>
                Description
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </label>
              <div className="form-grid">
                <label>
                  Owner
                  <select value={form.ownerId} onChange={(e) => setForm({ ...form, ownerId: e.target.value })}>
                    <option value="">Unassigned (admin managed)</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name} · {owner.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="checkbox-label standalone">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                  />
                  Canteen active
                </label>
              </div>
              <div className="form-actions">
                <button className="primary" type="submit" disabled={saving}>
                  <Save size={15} /> {saving ? "Saving…" : creating ? "Create canteen" : "Save changes"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </section>
  );
}
