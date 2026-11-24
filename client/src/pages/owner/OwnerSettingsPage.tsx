import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Clock3, Save, Store } from "lucide-react";
import Heading from "@/components/Heading";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { canteenAPI, type CanteenSettings } from "@/lib/api";

const DAYS = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

export default function OwnerSettingsPage() {
  const { currentCanteen, refreshCanteens, loading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<CanteenSettings | null>(null);
  const [contact, setContact] = useState({ phone: "", email: "", alternatePhone: "", address: "" });
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (currentCanteen) {
      setSettings(currentCanteen.settings);
      setContact({
        phone: currentCanteen.contact?.phone || "",
        email: currentCanteen.contact?.email || "",
        alternatePhone: currentCanteen.contact?.alternatePhone || "",
        address: currentCanteen.contact?.address || "",
      });
      setIsActive(currentCanteen.isActive);
    }
  }, [currentCanteen]);

  if (loading) return <div className="loading">Loading settings…</div>;
  if (!currentCanteen || !settings) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Store size={34} />
          <h2>Create a canteen first</h2>
          <p>Settings are stored per canteen.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const setSetting = <K extends keyof CanteenSettings>(key: K, value: CanteenSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const toggleDay = (day: string) => {
    setSettings((prev) => {
      if (!prev) return prev;
      const next = prev.operatingDays.includes(day)
        ? prev.operatingDays.filter((entry) => entry !== day)
        : [...prev.operatingDays, day];
      return { ...prev, operatingDays: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await canteenAPI.update(currentCanteen._id, { settings, contact, isActive });
      await refreshCanteens();
      toast("Settings saved");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <Heading
        title="Canteen settings"
        sub={`Operating hours, order acceptance and contact details for ${currentCanteen.name}.`}
      />

      <div className="two settings-grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Availability</h2>
              <p>Control whether students can place orders.</p>
            </div>
            <Clock3 size={20} />
          </div>

          <div className="switch-row">
            <div>
              <b>Canteen visible</b>
              <small>Turn off to hide the canteen from students.</small>
            </div>
            <button
              className={`toggle ${isActive ? "on" : ""}`}
              onClick={() => setIsActive((prev) => !prev)}
              type="button"
              aria-pressed={isActive}
            >
              <span />
            </button>
          </div>
          <div className="switch-row">
            <div>
              <b>Accepting orders</b>
              <small>Temporarily pause new orders without hiding the canteen.</small>
            </div>
            <button
              className={`toggle ${settings.acceptingOrders ? "on" : ""}`}
              onClick={() => setSetting("acceptingOrders", !settings.acceptingOrders)}
              type="button"
              aria-pressed={settings.acceptingOrders}
            >
              <span />
            </button>
          </div>

          <div className="form-grid">
            <label>
              Opening time
              <input
                type="time"
                value={settings.openingTime}
                onChange={(event) => setSetting("openingTime", event.target.value)}
              />
            </label>
            <label>
              Closing time
              <input
                type="time"
                value={settings.closingTime}
                onChange={(event) => setSetting("closingTime", event.target.value)}
              />
            </label>
            <label>
              Preparation time (min)
              <input
                type="number"
                min="1"
                max="240"
                value={settings.preparationTime}
                onChange={(event) => setSetting("preparationTime", Number(event.target.value))}
              />
            </label>
            <label>
              Minimum order (₹)
              <input
                type="number"
                min="0"
                value={settings.minOrderAmount}
                onChange={(event) => setSetting("minOrderAmount", Number(event.target.value))}
              />
            </label>
          </div>

          <label>
            Operating days
            <div className="day-row">
              {DAYS.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  className={settings.operatingDays.includes(day.value) ? "day on" : "day"}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={settings.contactVisible}
              onChange={(event) => setSetting("contactVisible", event.target.checked)}
            />
            Show contact details to students
          </label>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Contact details</h2>
              <p>Shown on the student-facing canteen page.</p>
            </div>
          </div>
          <label>
            Contact phone
            <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} />
          </label>
          <label>
            Contact email
            <input
              type="email"
              value={contact.email}
              onChange={(e) => setContact({ ...contact, email: e.target.value })}
            />
          </label>
          <label>
            Alternate phone
            <input
              value={contact.alternatePhone}
              onChange={(e) => setContact({ ...contact, alternatePhone: e.target.value })}
            />
          </label>
          <label>
            Address
            <input value={contact.address} onChange={(e) => setContact({ ...contact, address: e.target.value })} />
          </label>
          <div className="form-actions">
            <button className="primary" onClick={save} disabled={saving}>
              <Save size={15} /> {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
