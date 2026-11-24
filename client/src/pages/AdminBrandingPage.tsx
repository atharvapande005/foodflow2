import { useEffect, useState } from "react";
import { ChefHat, Image as ImageIcon, Trash2, Upload } from "lucide-react";
import Heading from "@/components/Heading";
import { useToast } from "@/lib/toast";
import { settingsAPI, uploadAPI } from "@/lib/api";

/**
 * Platform-level branding. Deliberately separate from a canteen's own branding
 * page: this controls the FoodFlow mark in the main sidebar only.
 */
export default function AdminBrandingPage() {
  const { toast } = useToast();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsAPI
      .get()
      .then((res) => setLogoUrl(res.data.settings.logoUrl))
      .catch(() => toast("Could not load platform branding"))
      .finally(() => setLoading(false));
  }, [toast]);

  const announce = (url: string | null) => {
    window.dispatchEvent(new CustomEvent<string | null>("foodflow:platform-logo", { detail: url }));
  };

  const saveLogo = async (url: string | null, successMessage: string) => {
    setSaving(true);
    try {
      const res = await settingsAPI.update({ logoUrl: url });
      setLogoUrl(res.data.settings.logoUrl);
      announce(res.data.settings.logoUrl);
      toast(successMessage);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Could not save the platform logo");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Images must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadAPI.image(file, "platform");
      await saveLogo(res.data.url, "Sidebar logo updated");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const busy = uploading || saving;

  return (
    <section className="page">
      <Heading
        title="Branding & appearance"
        sub="Control the FoodFlow logo in the main sidebar. Each canteen's own logo is managed on its canteen branding page."
      />

      {loading ? (
        <div className="loading">Loading branding…</div>
      ) : (
        <div className="branding-layout">
          <div className="branding-controls">
            <div className="panel">
              <div className="panel-head">
                <div>
                  <h2>Sidebar logo</h2>
                  <p>Shown beside the FoodFlow name on every signed-in page.</p>
                </div>
                <ImageIcon size={20} />
              </div>
              <div className="upload-row">
                <div className="upload-preview logo-preview">
                  <span className="brand-logo-preview">
                    {logoUrl ? <img src={logoUrl} alt="Current sidebar logo" /> : <ChefHat size={34} />}
                  </span>
                </div>
                <div className="upload-actions">
                  <label className="secondary upload-label">
                    <Upload size={15} />
                    {uploading ? "Uploading…" : logoUrl ? "Replace logo" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                      onChange={(event) => uploadLogo(event.target.files?.[0])}
                      disabled={busy}
                    />
                  </label>
                  {logoUrl && (
                    <button
                      className="danger-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => saveLogo(null, "Default logo restored")}
                    >
                      <Trash2 size={14} /> Remove logo
                    </button>
                  )}
                  <small>PNG, JPG, WebP, GIF or AVIF · max 5 MB · proportions are preserved.</small>
                </div>
              </div>
            </div>
          </div>

          <div className="branding-preview-column">
            <div className="branding-preview">
              <span className="eyebrow dark">SIDEBAR PREVIEW</span>
              <div className="brand-preview-tile">
                <span className="brand-logo-preview">
                  {logoUrl ? <img src={logoUrl} alt="" /> : <ChefHat size={20} />}
                </span>
                <b>
                  Food<span>-</span>Flow
                </b>
              </div>
              <p className="field-hint">
                The logo keeps its proportions inside the existing 36px tile. Remove it to restore the default
                FoodFlow mark.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
