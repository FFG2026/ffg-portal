import { readdirSync, statSync } from "fs";
import { join } from "path";
import { spawnSync } from "child_process";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

const files = walk("lib").sort();
if (!files.length) {
  console.error("No lib/**/*.test.ts files found");
  process.exit(1);
}

let failed = 0;
for (const file of files) {
  const result = spawnSync(join("node_modules", ".bin", "tsx"), [file], {
    stdio: "inherit",
  });
  if (result.status !== 0) failed = 1;
}
process.exit(failed);
