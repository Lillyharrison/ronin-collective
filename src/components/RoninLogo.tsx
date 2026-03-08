import { forwardRef } from "react";
import roninIcon from "@/assets/ronin-icon.png";
import roninLogo from "@/assets/ronin-logo.png";

interface RoninRProps {
  size?: number;
  className?: string;
}

// The standalone R icon — transparent PNG, inverted to cream/white on dark bg
export const RoninR = forwardRef<HTMLImageElement, RoninRProps>(
  function RoninR({ size = 32, className = "" }, ref) {
    return (
      <img
        ref={ref}
        src={roninIcon}
        alt="R"
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "invert(1)",
        }}
        className={className}
      />
    );
  }
);

// Full RONIN wordmark — transparent PNG, inverted to cream/white on dark bg
export const RoninWordmark = forwardRef<
  HTMLImageElement,
  { height?: number; className?: string }
>(function RoninWordmark({ height = 20, className = "" }, ref) {
  return (
    <img
      ref={ref}
      src={roninLogo}
      alt="Ronin"
      style={{ height, width: "auto", objectFit: "contain" }}
      className={className}
    />
  );
});
