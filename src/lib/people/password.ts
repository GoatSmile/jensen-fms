/**
 * Role-password hashing (auth v0.5) — scrypt from node:crypto, zero new
 * deps. Stored format is `saltHex:hashHex` in `roles.password_hash`,
 * write-only from the admin UI (the value is never displayed again).
 *
 * Node-runtime only (scrypt isn't available in Edge middleware) — that's
 * fine by design: the P2 login server action does the scrypt check once
 * and issues an HMAC-signed cookie; Edge middleware only verifies the
 * cookie. Dies at M1 when credentials move to the person (Supabase auth).
 */
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (expected.length === 0) return false;
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  return timingSafeEqual(actual, expected);
}
