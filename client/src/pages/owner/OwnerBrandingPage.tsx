import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Image as ImageIcon,
  Palette,
  RotateCcw,
  Save,
  Store,
  Trash2,
  Upload,
} from "lucide-react";
import Heading from "@/components/Heading";
import { CanteenLogo } from "@/components/CanteenIdentity";
import { useToast } from "@/lib/toast";
import { defaultBranding, useCanteen } from "@/lib/canteen";
import {
  canteenAPI,
  uploadAPI,
  type Canteen,
  type CanteenBranding,
} from "@/lib/api";

function BrandingPreview({
  canteen,
  branding,
}: {
  canteen: Canteen;
  branding: CanteenBranding;
}) {
  return (
    <div className="branding-preview">
      <span className="eyebrow dark">LIVE STUDENT PREVIEW</span>
      <div className="preview-stage">
        {branding.backgroundUrl ? (
          <div
            className="preview-bg"
            style={{
              backgroundImage: `url(${branding.backgroundUrl})`,
              backgroundPosition: branding.backgroundPosition,
              backgroundSize: branding.backgroundSize || "cover",
              opacity: branding.backgroundOpacity,
            }}
          />
        ) : (
          <div
            className="preview-bg preview-bg-fallback"
            style={{
              backgroundImage: `linear-gradient(135deg, ${branding.secondaryColor}, ${branding.primaryColor})`,
              opacity: Math.max(branding.backgroundOpacity, 0.3),
            }}
          />
        )}
        <div
          className="preview-overlay"
          style={{ backgroundColor: branding.overlayColor, opacity: branding.overlayOpacity }}
        />
        <div className="preview-content">
          <div className="preview-topbar">
            <span className="preview-brand">
              <Store size={13} /> FoodFlow
            </span>
            <span className="preview-open">OPEN</span>
          </div>
          <div className="preview-identity">
            <CanteenLogo canteen={{ ...canteen, branding }} size={58} />
            <div>
              <small>{canteen.institution?.collegeName || "CAMPUS CANTEEN"}</small>
              <h3>{canteen.name}</h3>
              <p>{canteen.tagline || canteen.description || "Fresh food, ready for pickup."}</p>
            </div>
          </div>
          <div className="preview-chips">
            <span style={{ background: branding.buttonColor }}>Browse menu</span>
            <span>Today's specials</span>
          </div>
          <div className="preview-cards">
            {["Veg Thali", "Masala Chai", "Cold Coffee"].map((name, index) => (
              <div key={name} className="preview-card">
                <span>{["🍛", "☕", "🥤"][index]}</span>
                <b>{name}</b>
                <small style={{ color: branding.primaryColor }}>₹{index === 0 ? 90 : index === 1 ? 15 : 50}</small>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="preview-note">
        Text and buttons stay fully opaque: the image and overlay are drawn on separate layers behind the
        interface.
      </p>
    </div>
  );
}

export default function OwnerBrandingPage() {
  const { currentCanteen, refreshCanteens, refreshCurrentCanteen, loading } = useCanteen();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [branding, setBranding] = useState<CanteenBranding>(defaultBranding());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "background" | null>(null);

  useEffect(() => {
    if (currentCanteen) setBranding({ ...defaultBranding(), ...currentCanteen.branding });
  }, [currentCanteen]);

  if (loading) return <div className="loading">Loading branding…</div>;

  if (!currentCanteen) {
    return (
      <section className="page">
        <div className="empty-state canteen-empty">
          <Palette size={34} />
          <h2>Create a canteen first</h2>
          <p>Branding belongs to a canteen. Set up your canteen profile to start customising it.</p>
          <button className="primary" onClick={() => navigate("/owner/canteen")}>
            Set up canteen
          </button>
        </div>
      </section>
    );
  }

  const update = <K extends keyof CanteenBranding>(key: K, value: CanteenBranding[K]) => {
    setBranding((prev) => ({ ...prev, [key]: value }));
  };

  const upload = async (kind: "logo" | "background", file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast("Please choose an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("Images must be 5 MB or smaller");
      return;
    }
    setUploading(kind);
    try {
      const res = await uploadAPI.image(file, kind);
      update(kind === "logo" ? "logoUrl" : "backgroundUrl", res.data.url);
      toast(`${kind === "logo" ? "Logo" : "Background"} uploaded — save to apply`);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await canteenAPI.updateBranding(currentCanteen._id, branding);
      setBranding(res.data.branding);
      await refreshCanteens();
      await refreshCurrentCanteen();
      toast("Branding saved");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to save branding");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm("Reset logo, background, opacity and colours to the FoodFlow defaults?")) return;
    setSaving(true);
    try {
      const res = await canteenAPI.updateBranding(currentCanteen._id, { reset: true });
      setBranding(res.data.branding);
      await refreshCanteens();
      await refreshCurrentCanteen();
      toast("Branding reset to defaults");
    } catch {
      toast("Failed to reset branding");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <Heading
        title="Branding & appearance"
        sub={`Customise ${currentCanteen.name}. Every canteen keeps its own independent identity.`}
      />

      <div className="branding-layout">
        <div className="branding-controls">
          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Canteen logo</h2>
                <p>Used on canteen cards, menu headers and navigation.</p>
              </div>
              <ImageIcon size={20} />
            </div>
            <div className="upload-row">
              <div className="upload-preview logo-preview">
                <CanteenLogo canteen={{ ...currentCanteen, branding }} size={84} />
              </div>
              <div className="upload-actions">
                <label className="secondary upload-label">
                  <Upload size={15} />
                  {uploading === "logo" ? "Uploading…" : branding.logoUrl ? "Replace logo" : "Upload logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={(event) => upload("logo", event.target.files?.[0])}
                    disabled={uploading !== null}
                  />
                </label>
                {branding.logoUrl && (
                  <button className="danger-ghost" onClick={() => update("logoUrl", null)}>
                    <Trash2 size={14} /> Remove logo
                  </button>
                )}
                <small>PNG, JPG, WebP, GIF or AVIF · max 5 MB · aspect ratio is preserved.</small>
              </div>
            </div>
            <label className="range-label">
              Logo display size <b>{Math.round(branding.logoScale * 100)}%</b>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={branding.logoScale}
                onChange={(event) => update("logoScale", Number(event.target.value))}
              />
            </label>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Background image</h2>
                <p>Upload a photo and control how strongly it appears behind the canteen.</p>
              </div>
              <ImageIcon size={20} />
            </div>
            <div className="upload-row">
              <div
                className="upload-preview background-preview"
                style={
                  branding.backgroundUrl
                    ? {
                        backgroundImage: `url(${branding.backgroundUrl})`,
                        backgroundPosition: branding.backgroundPosition,
                        backgroundSize: branding.backgroundSize || "cover",
                      }
                    : {
                        background: `linear-gradient(135deg, ${branding.secondaryColor}, ${branding.primaryColor})`,
                      }
                }
              />
              <div className="upload-actions">
                <label className="secondary upload-label">
                  <Upload size={15} />
                  {uploading === "background"
                    ? "Uploading…"
                    : branding.backgroundUrl
                      ? "Replace background"
                      : "Upload background"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                    onChange={(event) => upload("background", event.target.files?.[0])}
                    disabled={uploading !== null}
                  />
                </label>
                {branding.backgroundUrl && (
                  <button className="danger-ghost" onClick={() => update("backgroundUrl", null)}>
                    <Trash2 size={14} /> Remove background
                  </button>
                )}
                <label>
                  Image position
                  <select
                    value={branding.backgroundPosition}
                    onChange={(event) => update("backgroundPosition", event.target.value)}
                  >
                    <option value="center">Centre</option>
                    <option value="center top">Top</option>
                    <option value="center bottom">Bottom</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </label>
                <label>
                  Image fit
                  <select
                    value={branding.backgroundSize || "cover"}
                    onChange={(event) => update("backgroundSize", event.target.value)}
                  >
                    <option value="cover">Cover (fill, crop)</option>
                    <option value="contain">Contain (show whole image)</option>
                    <option value="auto">Original size</option>
                  </select>
                </label>
              </div>
            </div>
            <label className="range-label">
              Image opacity <b>{Math.round(branding.backgroundOpacity * 100)}%</b>
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.01}
                value={branding.backgroundOpacity}
                onChange={(event) => update("backgroundOpacity", Number(event.target.value))}
              />
            </label>
            <p className="field-hint">
              The background is drawn on its own layer behind the interface, so text and buttons always stay fully
              opaque.
            </p>
          </div>

          <div className="panel">
            <div className="panel-head">
              <div>
                <h2>Overlay & colours</h2>
                <p>Keep text readable and match your canteen's brand.</p>
              </div>
              <Palette size={20} />
            </div>
            <div className="form-grid">
              <label>
                Overlay colour
                <div className="color-input">
                  <input
                    type="color"
                    value={branding.overlayColor}
                    onChange={(event) => update("overlayColor", event.target.value)}
                  />
                  <input
                    value={branding.overlayColor}
                    onChange={(event) => update("overlayColor", event.target.value)}
                  />
                </div>
              </label>
              <label>
                Primary colour
                <div className="color-input">
                  <input
                    type="color"
                    value={branding.primaryColor}
                    onChange={(event) => update("primaryColor", event.target.value)}
                  />
                  <input
                    value={branding.primaryColor}
                    onChange={(event) => update("primaryColor", event.target.value)}
                  />
                </div>
              </label>
              <label>
                Secondary colour
                <div className="color-input">
                  <input
                    type="color"
                    value={branding.secondaryColor}
                    onChange={(event) => update("secondaryColor", event.target.value)}
                  />
                  <input
                    value={branding.secondaryColor}
                    onChange={(event) => update("secondaryColor", event.target.value)}
                  />
                </div>
              </label>
              <label>
                Accent colour
                <div className="color-input">
                  <input
                    type="color"
                    value={branding.accentColor}
                    onChange={(event) => update("accentColor", event.target.value)}
                  />
                  <input
                    value={branding.accentColor}
                    onChange={(event) => update("accentColor", event.target.value)}
                  />
                </div>
              </label>
              <label>
                Button colour
                <div className="color-input">
                  <input
                    type="color"
                    value={branding.buttonColor}
                    onChange={(event) => update("buttonColor", event.target.value)}
                  />
                  <input
                    value={branding.buttonColor}
                    onChange={(event) => update("buttonColor", event.target.value)}
                  />
                </div>
              </label>
            </div>
            <label className="range-label">
              Overlay opacity <b>{Math.round(branding.overlayOpacity * 100)}%</b>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={branding.overlayOpacity}
                onChange={(event) => update("overlayOpacity", Number(event.target.value))}
              />
            </label>
          </div>

          <div className="form-actions sticky-actions">
            <button className="primary" onClick={save} disabled={saving || uploading !== null}>
              <Save size={15} /> {saving ? "Saving…" : "Save branding"}
            </button>
            <button className="secondary" onClick={reset} disabled={saving}>
              <RotateCcw size={15} /> Reset to default
            </button>
          </div>
        </div>

        <div className="branding-preview-column">
          <BrandingPreview canteen={currentCanteen} branding={branding} />
        </div>
      </div>
    </section>
  );
}
