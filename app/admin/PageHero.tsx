"use client";

import { ReactNode } from "react";

export default function PageHero({
  title,
  subtitle,
  search,
  onSearch,
  searchPlaceholder,
  action,
}: {
  title: string;
  subtitle: string;
  search?: string;
  onSearch?: (value: string) => void;
  searchPlaceholder?: string;
  action?: ReactNode;
}) {
  return (
    <section className="page-hero">
      <div className="page-hero-copy">
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="page-hero-tools">
        {onSearch && (
          <label className="page-hero-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search || ""}
              onChange={(e) => onSearch(e.target.value)}
              placeholder={searchPlaceholder || "Search"}
            />
          </label>
        )}
        {action}
      </div>
    </section>
  );
}
