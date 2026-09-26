"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Scale } from "lucide-react";

const LINKS = [
  { href: "/stamp-duty", label: "Stamp Duty" },
  { href: "/game-changers", label: "Game changers" },
];

export default function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <Scale className="h-6 w-6 text-indigo-900" aria-hidden />
          Legal-TechAI
        </Link>
        <nav className="flex items-center gap-2 text-sm font-medium">
          {LINKS.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "rounded-full bg-slate-900 px-3 py-1.5 text-white"
                    : "rounded-full px-3 py-1.5 text-slate-600 hover:bg-slate-100"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
