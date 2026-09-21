import { fetchAllIn } from "./fetch-all";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const seen: string[][] = [];
  const rows = await fetchAllIn(
    (chunk) => {
      seen.push(chunk);
      return {
        range: async () => ({
          data: chunk.map((id) => ({ id })),
          error: null,
        }),
      };
    },
    Array.from({ length: 90 }, (_, i) => `id-${i}`),
    80
  );
  assert(seen.length === 2, `chunks ${seen.length}`);
  assert(seen[0].length === 80, "first chunk 80");
  assert(seen[1].length === 10, "second chunk 10");
  assert(rows.length === 90, `rows ${rows.length}`);
  assert((await fetchAllIn(() => ({ range: async () => ({ data: [], error: null }) }), [])).length === 0, "empty");
  console.log("fetch-all in chunks ok");
}

run();
