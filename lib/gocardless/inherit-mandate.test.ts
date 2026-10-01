import { inheritedMandateId } from "./inherit-mandate";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

// Rochester: HP125 and HP128 both collect on MD01KF6NM9PYK5, so HP143 does too.
const rochester = inheritedMandateId([
  { gocardless_mandate_id: "MD01KF6NM9PYK5", status: "active" },
  { gocardless_mandate_id: "MD01KF6NM9PYK5", status: "active" },
]);
assert(rochester.mandateId === "MD01KF6NM9PYK5", "a customer's one mandate is inherited");
assert(rochester.reason === "inherited", "and reported as inherited");

assert(
  inheritedMandateId([]).mandateId === null,
  "a brand new customer inherits nothing"
);
assert(inheritedMandateId([]).reason === "none", "with nothing to inherit from");
assert(
  inheritedMandateId([{ gocardless_mandate_id: null, status: "active" }]).reason === "none",
  "an existing customer with no mandate anywhere inherits nothing"
);

// Two mandates is the only real ambiguity — a person picks.
const twoLive = inheritedMandateId([
  { gocardless_mandate_id: "MD_A", status: "active" },
  { gocardless_mandate_id: "MD_B", status: "active" },
]);
assert(twoLive.mandateId === null, "two live mandates are never guessed between");
assert(twoLive.reason === "ambiguous", "and are flagged for review");

// JW Plant: an old settled agreement on one mandate, a live one on another.
// The live mandate is the one collecting today.
const jw = inheritedMandateId([
  { gocardless_mandate_id: "MD_OLD", status: "settled" },
  { gocardless_mandate_id: "MD_LIVE", status: "active" },
]);
assert(jw.mandateId === "MD_LIVE", "a live agreement's mandate beats a settled one's");
assert(jw.reason === "inherited", "and counts as a straight inherit");

// In The Future Ltd: nothing live carries a mandate, so the settled one stands.
const closedOnly = inheritedMandateId([
  { gocardless_mandate_id: null, status: "active" },
  { gocardless_mandate_id: "MD_OLD", status: "settled" },
]);
assert(closedOnly.mandateId === "MD_OLD", "a settled agreement still supplies the mandate");
assert(
  closedOnly.reason === "inherited-closed",
  "flagged so it can be said where it came from — that mandate may be cancelled"
);

const cancelledPair = inheritedMandateId([
  { gocardless_mandate_id: "MD_X", status: "cancelled" },
  { gocardless_mandate_id: "MD_Y", status: "settled" },
]);
assert(cancelledPair.mandateId === null, "two closed mandates are still a choice");
assert(cancelledPair.reason === "ambiguous", "so they go to review too");

assert(
  inheritedMandateId([
    { gocardless_mandate_id: "  MD_PAD  ", status: "active" },
    { gocardless_mandate_id: "MD_PAD", status: "active" },
  ]).mandateId === "MD_PAD",
  "the same id written untidily is one mandate, not two"
);

console.log("inherit-mandate tests ok");
