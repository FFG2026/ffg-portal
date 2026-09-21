type QueryLike<T> = {
  range: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
};

const PAGE = 1000;

/** PostgREST caps a single select at 1,000 rows. Page until the table is done. */
export async function fetchAllRows<T>(
  makeQuery: () => QueryLike<T>
): Promise<T[]> {
  const rows: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await makeQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}
