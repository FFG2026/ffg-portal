import { generateKeyPairSync } from "crypto";
import { parseServiceAccountJson } from "./service-account";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const json = JSON.stringify({
  client_email: "dcf-google-drive@portal-page-508706.iam.gserviceaccount.com",
  private_key: pem,
});

const parsed = parseServiceAccountJson(json);
assert(
  parsed?.client_email ===
    "dcf-google-drive@portal-page-508706.iam.gserviceaccount.com",
  "email"
);
assert(parsed?.private_key.includes("BEGIN"), "pem restored");
assert(parseServiceAccountJson("") === null, "empty");
assert(parseServiceAccountJson("{") === null, "bad json");
assert(
  parseServiceAccountJson(`"${json}"`)?.client_email?.includes("dcf-google-drive"),
  "strips wrapping quotes"
);

console.log("service-account tests ok");
