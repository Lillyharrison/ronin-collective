import roninLogo from "@/assets/ronin-logo.jpg";

interface RoninLogoProps {
  size?: number;
  className?: string;
}

// Crops just the "R" glyph from the Ronin wordmark using object-position
export function RoninR({ size = 36, className = "" }: RoninLogoProps) {
  return (
    <div
      className={`rounded-sm overflow-hidden bg-charcoal flex items-center justify-center ${className}`}
      style={{ width: size, height: size, minWidth: size }}
    >
      <img
        src={roninLogo}
        alt="R"
        style={{
          width: size * 5.5,
          height: "auto",
          objectFit: "cover",
          marginLeft: `-${size * 0.1}px`,
          filter: "invert(1)",
        }}
      />
    </div>
  );
}

// Full wordmark (for header center)
export function RoninWordmark({ height = 22, className = "" }: { height?: number; className?: string }) {
  return (
    <img
      src={roninLogo}
      alt="Ronin"
      style={{ height, width: "auto", filter: "invert(1)" }}
      className={className}
    />
  );
}
