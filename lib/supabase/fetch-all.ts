type RangeQuery<T> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

type OrderedQuery<T> = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) => RangeQuery<T>;
};

const PAGE = 1000;
/** Stay under PostgREST URL limits for `.in()` filters (UUIDs are long). */
const IN_CHUNK = 80;

/**
 * PostgREST caps a single select at 1,000 rows. Page until the table is done.
 * Always sort by `sortKey` (default `id`) so pages cannot skip or duplicate.
 */
export async function fetchAllRows<T>(
  makeQuery: () => OrderedQuery<T>,
  sortKey = "id"
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery()
      .order(sortKey, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

export async function fetchAllIn<T>(
  makeQuery: (chunk: string[]) => OrderedQuery<T>,
  ids: string[],
  chunkSize = IN_CHUNK
): Promise<T[]> {
  if (!ids.length) return [];
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    rows.push(
      ...(await fetchAllRows(() => makeQuery(ids.slice(i, i + chunkSize))))
    );
  }
  return rows;
}
