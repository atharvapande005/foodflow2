import { useState } from "react";
import { Camera, KeyRound, Save, ShieldCheck } from "lucide-react";
import Heading from "@/components/Heading";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { useCanteen } from "@/lib/canteen";
import { uploadAPI } from "@/lib/api";

export default function OwnerProfilePage() {
  const { user, updateProfile } = useAuth();
  const { canteens } = useCanteen();
  const { toast } = useToast();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [avatar, setAvatar] = useState(user?.avatar || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!user) return null;

  const uploadAvatar = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("Images must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const res = await uploadAPI.image(file, "avatar");
      setAvatar(res.data.url);
      toast("Photo uploaded — save your profile to apply");
    } catch {
      toast("Photo upload failed");
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ name, email, phone, avatar: avatar || null });
      toast("Profile updated");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword) {
      toast("Enter your current and new password");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      toast("Password changed");
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast(message || "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="page">
      <Heading
        title="Owner profile"
        sub="This is your personal account. It is separate from your canteen's public identity."
      />

      <div className="profile-layout">
        <form className="panel" onSubmit={saveProfile}>
          <div className="panel-head">
            <div>
              <h2>Personal information</h2>
              <p>Your profile photo is never used as the canteen logo automatically.</p>
            </div>
            <ShieldCheck size={20} />
          </div>

          <div className="profile-avatar-row">
            <Avatar name={name || user.name} src={avatar} size={78} />
            <div className="upload-actions">
              <label className="secondary upload-label">
                <Camera size={15} />
                {uploading ? "Uploading…" : avatar ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  onChange={(event) => uploadAvatar(event.target.files?.[0])}
                  disabled={uploading}
                />
              </label>
              {avatar && (
                <button type="button" className="danger-ghost" onClick={() => setAvatar("")}>
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div className="form-grid">
            <label>
              Full name
              <input value={name} onChange={(event) => setName(event.target.value)} required />
            </label>
            <label>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
            <label>
              Phone
              <input value={phone} onChange={(event) => setPhone(event.target.value)} />
            </label>
          </div>

          <div className="form-actions">
            <button className="primary" type="submit" disabled={saving || uploading}>
              <Save size={15} /> {saving ? "Saving…" : "Save profile"}
            </button>
          </div>
        </form>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h2>Account</h2>
              <p>Role and canteen access.</p>
            </div>
            <KeyRound size={20} />
          </div>
          <div className="status-list">
            <div className="status-row">
              <span>Account role</span>
              <strong>Canteen owner</strong>
            </div>
            <div className="status-row">
              <span>Canteens managed</span>
              <strong>{canteens.length}</strong>
            </div>
            <div className="status-row">
              <span>Email</span>
              <strong>{user.email}</strong>
            </div>
          </div>

          <h3 className="form-section-title">Change password</h3>
          <form onSubmit={changePassword}>
            <label>
              Current password
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Current password"
              />
            </label>
            <label>
              New password
              <input
                type="password"
                minLength={6}
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="At least 6 characters"
              />
            </label>
            <button className="secondary" type="submit" disabled={saving}>
              Update password
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
