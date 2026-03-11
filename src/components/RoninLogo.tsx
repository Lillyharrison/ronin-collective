import { forwardRef } from "react";
import roninLogo from "@/assets/ronin-logo.png";

// Lazy icon URL — not imported as a module so it's excluded from the initial JS bundle.
// The browser only downloads it when the <img> enters the viewport.
const RONIN_ICON_URL = new URL("../assets/ronin-icon-opt.png", import.meta.url).href;

interface RoninRProps {
  size?: number;
  className?: string;
}

// The standalone R icon — lazy loaded to avoid blocking initial paint
export const RoninR = forwardRef<HTMLImageElement, RoninRProps>(
  function RoninR({ size = 32, className = "" }, ref) {
    return (
      <img
        ref={ref}
        src={RONIN_ICON_URL}
        alt="R"
        loading="lazy"
        decoding="async"
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "invert(1)",
          contentVisibility: "auto",
        }}
        className={className}
      />
    );
  }
);

// Full RONIN wordmark — small PNG, fine to load eagerly (it's in the header)
export const RoninWordmark = forwardRef<
  HTMLImageElement,
  { height?: number; className?: string }
>(function RoninWordmark({ height = 20, className = "" }, ref) {
  return (
    <img
      ref={ref}
      src={roninLogo}
      alt="Ronin"
      decoding="async"
      style={{ height, width: "auto", objectFit: "contain" }}
      className={className}
    />
  );
});
