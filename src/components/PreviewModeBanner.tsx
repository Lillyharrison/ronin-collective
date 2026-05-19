import { Eye, X } from "lucide-react";
import { usePermissions, usePermissionsControl } from "@/hooks/usePermissions";

/**
 * Fixed banner shown at the very top of the app whenever a master admin is
 * currently viewing the UI through another user's permission lens ("View as user").
 *
 * Sets the `--preview-banner-h` CSS variable so the header & main content
 * shift down accordingly (mirrors the PushPromptBanner pattern).
 */
const BANNER_HEIGHT = 36;

export function PreviewModeBanner() {
  const { isPreviewing, previewName, role, level } = usePermissions();
  const { exitPreview } = usePermissionsControl();

  // Imperative side-effect: keep CSS var in sync so layout reserves room.
  if (typeof document !== "undefined") {
    document.documentElement.style.setProperty(
      "--preview-banner-h",
      isPreviewing ? `${BANNER_HEIGHT}px` : "0px",
    );
  }

  if (!isPreviewing) return null;

  const subLabel = [role, level].filter(Boolean).join(" · ");

  return (
    <div
      className="fixed left-0 right-0 z-[80] flex items-center gap-2 px-3 bg-gold text-charcoal shadow-md"
      style={{
        top: "calc(env(safe-area-inset-top, 0px) + var(--push-banner-h, 0px))",
        height: `${BANNER_HEIGHT}px`,
      }}
    >
      <Eye size={14} className="shrink-0" />
      <p className="flex-1 text-xs font-semibold leading-tight truncate">
        Viewing as <span className="font-bold">{previewName ?? "User"}</span>
        {subLabel && <span className="font-normal opacity-75"> — {subLabel}</span>}
        <span className="font-normal opacity-75 hidden sm:inline"> · writes affect their real data</span>
      </p>
      <button
        onClick={exitPreview}
        className="shrink-0 flex items-center gap-1 text-xs font-bold uppercase tracking-wide bg-charcoal/90 text-gold px-2.5 py-1 rounded-md hover:bg-charcoal"
      >
        <X size={12} /> Exit
      </button>
    </div>
  );
}
