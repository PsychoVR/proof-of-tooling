"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { CLUSTER_SCOPE_LABEL } from "@/lib/clusters";

const LINKS = [
  { href: "/", label: "Ledger" },
  { href: "/claim", label: "Claim a tool" },
  { href: "/registry", label: "Registry" },
];

export function SiteHeader() {
  const path = usePathname();
  return (
    <header className="top">
      <div className="wrap">
        <Link className="brand" href="/" aria-label="Proof of Tooling home">
          <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
            <defs>
              <linearGradient id="brand-grad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0" stopColor="#14f195" />
                <stop offset=".5" stopColor="#22a7bc" />
                <stop offset="1" stopColor="#9945ff" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="24" height="24" rx="5" fill="url(#brand-grad)" />
            <path
              d="M7 7v12M11 7v12M15 7v12M19 7v12M5 17L21 9"
              stroke="var(--accent-ink)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
          Proof of Tooling
        </Link>
        <span className="pill">
          <span className="dot" aria-hidden="true" />
          {CLUSTER_SCOPE_LABEL}
        </span>
        <nav className="nav" aria-label="Sections">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path === l.href ? "page" : undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
