import { generateKeyPairSync, sign } from "node:crypto";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const TEST_JWT_PUBLIC_KEY = publicKey.export({ type: "spki", format: "pem" }).toString();
const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export interface TokenOptions {
  sub: string;
  expiresInSec?: number;
  notBeforeOffsetSec?: number;
  azp?: string;
  fva?: [number, number];
  wrongKey?: boolean;
  sts?: string;
}

/** Produces an RS256 session token shaped like Clerk's, signed with a local test key. */
export function signSessionToken(o: TokenOptions): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT", kid: "ins_test" };
  const payload: Record<string, unknown> = {
    sub: o.sub,
    sid: `sess_${o.sub}`,
    iss: "https://test-instance.clerk.accounts.dev",
    azp: o.azp ?? "http://localhost:3000",
    iat: now - 5,
    nbf: now - 5 + (o.notBeforeOffsetSec ?? 0),
    exp: now + (o.expiresInSec ?? 60),
    v: 2,
  };
  if (o.fva) payload.fva = o.fva;
  if (o.sts) payload.sts = o.sts;
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = sign("RSA-SHA256", Buffer.from(data), o.wrongKey ? otherKey : privateKey);
  return `${data}.${b64url(signature)}`;
}
