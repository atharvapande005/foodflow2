import { useEffect, useState } from "react";
import { ChefHat } from "lucide-react";
import { settingsAPI } from "@/lib/api";

/**
 * The platform wordmark. `usePlatformLogo` is opt-in so the sidebar can show the
 * admin-configured image while public/auth screens keep the default mark.
 */
export default function Brand({ usePlatformLogo = false }: { usePlatformLogo?: boolean }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!usePlatformLogo) return;

    let active = true;
    const applyLogo = (url: string | null) => {
      if (active) setLogoUrl(url || null);
    };

    settingsAPI
      .get()
      .then((res) => applyLogo(res.data.settings.logoUrl))
      .catch(() => undefined);

    // The branding page announces saved changes so the sidebar updates at once.
    const onLogoChanged = (event: Event) => {
      applyLogo((event as CustomEvent<string | null>).detail ?? null);
    };
    window.addEventListener("foodflow:platform-logo", onLogoChanged);

    return () => {
      active = false;
      window.removeEventListener("foodflow:platform-logo", onLogoChanged);
    };
  }, [usePlatformLogo]);

  return (
    <div className="brand">
      <span>
        {usePlatformLogo && logoUrl ? (
          <img className="brand-logo" src={logoUrl} alt="" />
        ) : (
          <ChefHat size={20} />
        )}
      </span>
      Food<span>-</span>Flow
    </div>
  );
}
