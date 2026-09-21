import { isOwenBrunning } from "./owen";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(
  isOwenBrunning({ email: "olb@ffg.finance", name: "Owen Brunning" }) === true,
  "Owen's staff login is allowed"
);
assert(
  isOwenBrunning({ email: "OLB@FFG.FINANCE", name: "owen   brunning" }) === true,
  "email and name are normalised"
);
assert(isOwenBrunning({ email: "staff", name: "Staff" }) === false, "staff code is not Owen");
assert(
  isOwenBrunning({ email: "sales@ffg.finance", name: "Sales" }) === false,
  "other staff cannot open the owner figures"
);

console.log("owen tests ok");
