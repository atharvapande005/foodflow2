import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Save, Store, X } from "lucide-react";
import Heading from "@/components/Heading";
import QrPanel from "@/components/QrPanel";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { canteenAPI, type Canteen } from "@/lib/api";

interface CanteenForm {
  name: string;
  code: string;
  description: string;
  category: string;
  tagline: string;
  announcement: string;
  institution: {
    collegeName: string;
    location: string;
    campus: string;
    building: string;
    department: string;
  };
  contact: {
    phone: string;
    email: string;
    alternatePhone: string;
    address: string;
  };
}

const emptyForm: CanteenForm = {
  name: "",
  code: "",
  description: "",
  category: "Multi-cuisine",
  tagline: "",
  announcement: "",
  institution: { collegeName: "", location: "", campus: "", building: "", department: "" },
  contact: { phone: "", email: "", alternatePhone: "", address: "" },
};

function fromCanteen(canteen: Canteen): CanteenForm {
  return {
    name: canteen.name,
    code: canteen.code,
    description: canteen.description || "",
    category: canteen.category || "Multi-cuisine",
    tagline: canteen.tagline || "",
    announcement: canteen.announcement || "",
    institution: {
      collegeName: canteen.institution?.collegeName || "",
      location: canteen.institution?.location || "",
      campus: canteen.institution?.campus || "",
      building: canteen.institution?.building || "",
      department: canteen.institution?.department || "",
    },
    contact: {
      phone: canteen.contact?.phone || "",
      email: canteen.contact?.email || "",
      alternatePhone: canteen.contact?.alternatePhone || "",
      address: canteen.contact?.address || "",
    },
  };
}

export default function OwnerCanteenPage() {
  const { currentCanteen, refreshCanteens, selectCanteen, loading } = useCanteen();
  const { toast } = useToast();
  const [form, setForm] = useState<CanteenForm>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentCanteen) {
      setForm(fromCanteen(currentCanteen));
      setCreating(false);
    } else {
      setForm(emptyForm);
      setCreating(true);
    }
  }, [currentCanteen]);

  const setField = <K extends keyof CanteenForm>(key: K, value: CanteenForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setInstitution = (key: keyof CanteenForm["institution"], value: string) => {
    setForm((prev) => ({ ...prev, institution: { ...prev.institution, [key]: value } }));
  };

  const setContact = (key: keyof CanteenForm["contact"], value: string) => {
    setForm((prev) => ({ ...prev, contact: { ...prev.contact, [key]: value } }));
  };

  const startNew = () => {
    setForm(emptyForm);
    setCreating(true);
  };

  const cancelNew = () => {
    if (currentCanteen) {
      setForm(fromCanteen(currentCanteen));
      setCreating(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) {
      toast("Canteen name and code are required");
      return;
    }
    setSaving(true);
    try {
      if (creating) {
        const res = await canteenAPI.create({
          ...form,
          code: form.code.trim().toUpperCase(),
          isActive: true,
        });
        await refreshCanteens();
        selectCanteen(res.data.canteen._id);
        setCreating(false);
        toast("Canteen created");
      } else if (currentCanteen) {
        const res = await canteenAPI.update(currentCanteen._id, {
          ...form,
          code: form.code.trim().toUpperCase(),
        });
        setForm(fromCanteen(res.data.canteen));
        await refreshCanteens();
        toast("Canteen profile saved");
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to save canteen");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading canteen…</div>;

  return (
    <section className="page">
      <div className="page-title-row">
        <Heading
          title={creating ? "Create a canteen" : "Canteen profile"}
          sub="Your canteen identity, institution details and contact information."
        />
        {!creating && (
          <button className="secondary" onClick={startNew}>
            <Plus size={15} /> Add another canteen
          </button>
        )}
        {creating && currentCanteen && (
          <button className="secondary" onClick={cancelNew}>
            <X size={15} /> Cancel
          </button>
        )}
      </div>

      <form className="panel" onSubmit={submit}>
        <div className="panel-head">
          <div>
            <h2>Canteen identity</h2>
            <p>Students see this information on the canteen card and menu.</p>
          </div>
          <Store size={22} />
        </div>
        <div className="form-grid">
          <label>
            Canteen name *
            <input
              value={form.name}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="e.g. Main Canteen"
              required
            />
          </label>
          <label>
            Unique canteen code *
            <input
              value={form.code}
              onChange={(event) => setField("code", event.target.value.toUpperCase())}
              placeholder="e.g. MAIN"
              required
              maxLength={24}
            />
          </label>
          <label>
            Category
            <input
              value={form.category}
              onChange={(event) => setField("category", event.target.value)}
              placeholder="Multi-cuisine"
            />
          </label>
          <label>
            Tagline
            <input
              value={form.tagline}
              onChange={(event) => setField("tagline", event.target.value)}
              placeholder="Short canteen tagline"
            />
          </label>
        </div>
        <label>
          Description
          <textarea
            value={form.description}
            onChange={(event) => setField("description", event.target.value)}
            placeholder="What makes your canteen special?"
            rows={3}
          />
        </label>
        <label>
          Announcement banner
          <input
            value={form.announcement}
            onChange={(event) => setField("announcement", event.target.value)}
            placeholder="Optional message shown to students"
          />
        </label>

        <h3 className="form-section-title">Institution information</h3>
        <div className="form-grid">
          <label>
            College / university
            <input
              value={form.institution.collegeName}
              onChange={(event) => setInstitution("collegeName", event.target.value)}
              placeholder="College name"
            />
          </label>
          <label>
            Institution location
            <input
              value={form.institution.location}
              onChange={(event) => setInstitution("location", event.target.value)}
              placeholder="City / area"
            />
          </label>
          <label>
            Campus
            <input
              value={form.institution.campus}
              onChange={(event) => setInstitution("campus", event.target.value)}
              placeholder="Campus name"
            />
          </label>
          <label>
            Building / block
            <input
              value={form.institution.building}
              onChange={(event) => setInstitution("building", event.target.value)}
              placeholder="Building or block"
            />
          </label>
          <label>
            Department (optional)
            <input
              value={form.institution.department}
              onChange={(event) => setInstitution("department", event.target.value)}
              placeholder="Department"
            />
          </label>
        </div>

        <h3 className="form-section-title">Contact information</h3>
        <div className="form-grid">
          <label>
            Official contact number
            <input
              value={form.contact.phone}
              onChange={(event) => setContact("phone", event.target.value)}
              placeholder="+91 XXXXX XXXXX"
            />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={form.contact.email}
              onChange={(event) => setContact("email", event.target.value)}
              placeholder="canteen@college.edu"
            />
          </label>
          <label>
            Alternate number
            <input
              value={form.contact.alternatePhone}
              onChange={(event) => setContact("alternatePhone", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Address
            <input
              value={form.contact.address}
              onChange={(event) => setContact("address", event.target.value)}
              placeholder="Canteen address"
            />
          </label>
        </div>

        <div className="form-actions">
          <button className="primary" type="submit" disabled={saving}>
            <Save size={15} /> {saving ? "Saving…" : creating ? "Create canteen" : "Save changes"}
          </button>
        </div>
      </form>

      {!creating && currentCanteen && (
        <div className="notice info">
          Logo, background image, colours and overlays are configured in{" "}
          <Link to="/owner/branding">Branding &amp; appearance</Link>.
        </div>
      )}

      {!creating && currentCanteen && <QrPanel canteen={currentCanteen} />}
    </section>
  );
}
