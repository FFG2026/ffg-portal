export const BOOK_FFG = "ffg";
export const BOOK_GG = "gg";

export type AdminBook = typeof BOOK_FFG | typeof BOOK_GG;

export const GLACIER_GEM_FOLDER_ID = "1LzTZtlDR4cImxk5W1KGuKkHQZ1YtRkKa";

export function parseAdminBook(value: unknown): AdminBook {
  const s = String(value || "")
    .trim()
    .toLowerCase();
  if (s === "gg" || s === "glacier" || s === "glacier_gem" || s === "glacier gem") {
    return BOOK_GG;
  }
  return BOOK_FFG;
}

export function bookFromRequest(request: Request, body?: unknown): AdminBook {
  const header = request.headers.get("x-admin-book");
  const url = new URL(request.url);
  const fromBody =
    body && typeof body === "object"
      ? (body as { book?: unknown }).book
      : undefined;
  return parseAdminBook(header || url.searchParams.get("book") || fromBody);
}

export function bookLabel(book: AdminBook) {
  return book === BOOK_GG ? "Glacier Gem" : "Future FG";
}
