import Link from "next/link";
import type { Route } from "next";
import { ChevronRight } from "lucide-react";

type Segment = { label: string; href?: string };

export function PIABreadcrumb({ segments }: { segments: Segment[] }) {
  return (
    <nav className="flex items-center gap-1 text-sm">
      <Link href="/admin/tarot" className="text-gray-600 hover:text-gray-400 transition-colors text-xs">
        Admin
      </Link>
      {segments.map((seg, i) => (
        <span key={i} className="flex items-center gap-1">
          <ChevronRight size={12} className="text-gray-700" />
          {seg.href && i < segments.length - 1 ? (
            <Link href={seg.href as Route<string>} className="text-gray-500 hover:text-gray-300 text-xs transition-colors">
              {seg.label}
            </Link>
          ) : (
            <span className="text-gray-300 text-xs font-medium">{seg.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
