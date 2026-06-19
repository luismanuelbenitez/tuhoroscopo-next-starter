import Link from "next/link";
import { LogoIcon } from "./logo-icon";

interface LogoProps {
  className?: string;
}

export default function Logo({ className }: LogoProps) {
  return (
    <Link href="/" className={`flex items-center gap-3 hover:opacity-85 transition-opacity ${className ?? ""}`}>
      <LogoIcon size={40} />
      <div className="leading-none">
        <span
          className="block font-extrabold text-white"
          style={{ fontSize: "1rem", letterSpacing: "0.22em" }}
        >
          TU ORÁCULO
        </span>
      </div>
    </Link>
  );
}
