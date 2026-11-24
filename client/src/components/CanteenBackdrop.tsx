import type { Canteen } from "@/lib/api";

/**
 * Branding is rendered as two independent fixed layers behind the app.
 * Opacity is applied to the image/overlay layers only - never to the content
 * container - so text, buttons and logos stay fully opaque and readable.
 */
export default function CanteenBackdrop({ canteen }: { canteen: Canteen | null }) {
  if (!canteen) return null;
  const branding = canteen.branding;

  return (
    <div className="canteen-backdrop" aria-hidden="true">
      {branding.backgroundUrl ? (
        <div
          className="canteen-bg"
          style={{
            backgroundImage: `url(${branding.backgroundUrl})`,
            opacity: branding.backgroundOpacity,
            backgroundPosition: branding.backgroundPosition || "center",
          }}
        />
      ) : (
        <div
          className="canteen-bg canteen-bg-fallback"
          style={{
            opacity: Math.max(branding.backgroundOpacity, 0.25),
            backgroundImage: `linear-gradient(135deg, ${branding.secondaryColor}, ${branding.primaryColor})`,
          }}
        />
      )}
      <div
        className="canteen-overlay"
        style={{ backgroundColor: branding.overlayColor, opacity: branding.overlayOpacity }}
      />
    </div>
  );
}
