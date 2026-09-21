"use client";

import { useEffect } from "react";

const BOOK_EVENT = "ffg-book-changed";

/** Tell open admin pages (dashboard, agreements) to reload the book. */
export function notifyBookChanged() {
  if (typeof window === "undefined") return;
  localStorage.setItem(BOOK_EVENT, String(Date.now()));
  window.dispatchEvent(new Event(BOOK_EVENT));
}

export function useBookReload(load: () => void) {
  useEffect(() => {
    load();
    const run = () => load();
    const onVisible = () => {
      if (document.visibilityState === "visible") run();
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === BOOK_EVENT) run();
    };
    window.addEventListener("focus", run);
    window.addEventListener(BOOK_EVENT, run);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("focus", run);
      window.removeEventListener(BOOK_EVENT, run);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [load]);
}
