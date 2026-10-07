"use client";

import Link from "next/link";
import type { Route } from "next";
import type { ReactNode } from "react";
import { CTA_GRADIENT } from "./theme";

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href as Route<string>} className="text-[13px] text-white/65 hover:text-white transition-colors">
      {children}
    </Link>
  );
}

export function CtaButton({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href as Route<string>}
      className={`inline-block rounded-xl text-center font-bold ${className}`}
      style={{ background: CTA_GRADIENT, color: "#180e00", boxShadow: "0 4px 20px rgba(240,197,90,0.30)" }}
    >
      {children}
    </Link>
  );
}
