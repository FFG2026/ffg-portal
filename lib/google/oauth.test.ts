process.env.ADMIN_SECRET = "test-secret-for-hmac";

import { signOAuthState, verifyOAuthState } from "./oauth";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

const state = signOAuthState();
assert(verifyOAuthState(state), "fresh state verifies");
assert(!verifyOAuthState("nope"), "junk state rejected");
assert(!verifyOAuthState(state.slice(0, -2) + "zz"), "tampered state rejected");

console.log("oauth tests ok");
