import { hashPassword, verifyPassword, signAdminSession, readAdminSession } from "./admin-session";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

process.env.ADMIN_SECRET = "test-secret-for-hmac";

const hashed = hashPassword("correct-horse");
assert(verifyPassword("correct-horse", hashed), "password verifies");
assert(!verifyPassword("wrong", hashed), "wrong password rejected");

const token = signAdminSession("Owen@FFG.finance");
const session = readAdminSession(token);
assert(session?.email === "owen@ffg.finance", "session email is lowercased");
assert(!readAdminSession("s.nope.nope"), "junk token rejected");
assert(!readAdminSession(process.env.ADMIN_SECRET || ""), "staff code is not a session");

console.log("admin-session tests ok");
