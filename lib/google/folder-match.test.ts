import {
  parseDealFolderTitle,
  pickFolderForAgreement,
} from "./folder-match";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  parseDealFolderTitle("HP143 - Rochester Utilities Ltd")?.agreement_number ===
    "HP143",
  "hp143 number"
);
assert(
  parseDealFolderTitle("HP143 - Rochester Utilities Ltd")?.company ===
    "Rochester Utilities Ltd",
  "hp143 company"
);
assert(
  parseDealFolderTitle("HP00098 - Vital Vehicle Hire")?.agreement_number ===
    "HP98",
  "leading zeros"
);
assert(
  parseDealFolderTitle("FL00016 _ LMK2 Limited")?.agreement_number === "FL16",
  "fl underscore"
);
assert(
  parseDealFolderTitle("L00004 LMK 2 Limited")?.agreement_number === "L4",
  "loan folder"
);
assert(
  parseDealFolderTitle("HP111 Larkspur Group Ltd")?.agreement_number ===
    "HP111",
  "no separator"
);
assert(parseDealFolderTitle("GG14 - Prior Construction Limited")?.agreement_number === "GG14", "gg14");
assert(parseDealFolderTitle("GG01")?.agreement_number === "GG01", "gg01");
assert(parseDealFolderTitle("HP Finance Douments V2.pdf") === null, "pdf pack");
assert(parseDealFolderTitle("HP41/1") === null, "instalment ref is not a deal folder");

const picked = pickFolderForAgreement("HP93", [
  {
    id: "old",
    name: "HP00093 - Van Repair Services  Limited - Discovery",
    modifiedTime: "2025-02-18T16:21:34.675Z",
  },
  {
    id: "new",
    name: "HP93 - Van Repair",
    modifiedTime: "2026-01-01T00:00:00.000Z",
  },
]);
assert(picked?.id === "new", "prefers newer folder");

console.log("folder-match tests ok");
