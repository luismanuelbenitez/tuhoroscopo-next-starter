import Image from "next/image";

interface LogoIconProps {
  size?: number;
}

export function LogoIcon({ size = 40 }: LogoIconProps) {
  return (
    <Image
      src="/img/logo/logo-isotipo.png"
      alt="Tu Oráculo"
      width={size}
      height={size}
      style={{ objectFit: "contain" }}
      priority
    />
  );
}
