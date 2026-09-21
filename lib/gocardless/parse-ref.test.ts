import {
  parseAgreementRef,
  parseAgreementRefFromPayment,
  compareAgreementNumber,
} from "./parse-ref";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

assert(parseAgreementRef("HP41/1")?.agreement_number === "HP41", "hp41");
assert(parseAgreementRef("HP41/1")?.instalment_number === 1, "inst 1");
assert(parseAgreementRef("HP41/2")?.instalment_number === 2, "inst 2");
assert(parseAgreementRef("hp041 / 03")?.agreement_number === "HP41", "zeros");
assert(parseAgreementRef("hp041 / 03")?.instalment_number === 3, "inst 3");
assert(parseAgreementRef("FL16-4")?.agreement_number === "FL16", "fl dash");
assert(parseAgreementRef("L2/12")?.agreement_number === "L2", "loan");
assert(parseAgreementRef("HP4/1")?.agreement_number === "HP4", "hp4 not hp41");
assert(parseAgreementRef("FFG HP104")?.agreement_number === "HP104", "ffg prefix");
assert(parseAgreementRef("Payment for HP41")?.instalment_number === null, "no inst");
assert(parseAgreementRef("GG14 - Prior")?.agreement_number === "GG14", "gg14");
assert(parseAgreementRef("GG01")?.agreement_number === "GG01", "gg01");
assert(parseAgreementRef("rent") === null, "unrelated");

assert(
  parseAgreementRefFromPayment({
    description: "HP41/9",
    reference: "unused",
  })?.instalment_number === 9,
  "prefers description"
);

assert(
  parseAgreementRefFromPayment({
    description: "Monthly",
    metadata: { agreement: "HP41", instalment: 2 },
  })?.instalment_number === 2,
  "metadata instalment"
);

assert(compareAgreementNumber("HP14", "HP141") < 0, "hp14 before hp141");
assert(compareAgreementNumber("HP140", "HP141") < 0, "hp140 before hp141");
assert(compareAgreementNumber("HP142", "HP143") < 0, "hp142 before hp143");
assert(compareAgreementNumber("FL16", "HP1") < 0, "FL before HP");

console.log("parse-ref tests ok");
