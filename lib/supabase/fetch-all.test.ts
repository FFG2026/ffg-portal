import { fetchAllRows } from "./fetch-all";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const all = Array.from({ length: 2503 }, (_, i) => ({ i }));
  const rows = await fetchAllRows(() => ({
    range: async (a: number, b: number) => ({
      data: all.slice(a, b + 1),
      error: null,
    }),
  }));
  assert(rows.length === 2503, `expected 2503 got ${rows.length}`);
  assert(rows[0].i === 0 && rows[2502].i === 2502, "order preserved");
  console.log("fetch-all tests ok");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
