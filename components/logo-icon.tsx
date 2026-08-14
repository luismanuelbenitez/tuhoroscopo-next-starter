import Image from "next/image";
import type { CSSProperties } from "react";

interface LogoIconProps {
  size?: number;
  style?: CSSProperties;
}

export function LogoIcon({ size = 40, style }: LogoIconProps) {
  return (
    <Image
      src="/img/logo/logo-isotipo.png"
      alt="Tu Oráculo"
      width={size}
      height={size}
      style={{ objectFit: "contain", ...style }}
      priority
    />
  );
}
