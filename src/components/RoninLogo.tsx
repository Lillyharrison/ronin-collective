import roninIcon from "@/assets/ronin-icon.png";
import roninLogo from "@/assets/ronin-logo.png";

interface RoninRProps {
  size?: number;
  className?: string;
}

// The standalone R icon — transparent PNG, inverted to cream/white on dark bg
export function RoninR({ size = 32, className = "" }: RoninRProps) {
  return (
    <img
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

// Full RONIN wordmark — transparent PNG, inverted to cream/white on dark bg
export function RoninWordmark({
  height = 20,
  className = "",
}: {
  height?: number;
  className?: string;
}) {
  return (
    <img
      src={roninLogo}
      alt="Ronin"
      style={{ height, width: "auto", objectFit: "contain", filter: "invert(1)" }}
      className={className}
    />
  );
}
