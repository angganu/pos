import "server-only";
import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "@prisma/client";
import { AuthError } from "./errors";
import { authSecret, JWT_ALG, SESSION_COOKIE } from "./secret";

const HOURS = Number(process.env.SESSION_HOURS) > 0 ? Number(process.env.SESSION_HOURS) : 12;

/** bcrypt only reads the first 72 bytes; refuse longer input rather than silently truncating. */
export const PASSWORD_MAX = 72;

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  storeId: number | null;
  storeName: string | null;
  storeCode: string | null;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

/**
 * Short fingerprint of the stored password hash, carried in the token.
 * Changing a password changes the hash, which invalidates every older session.
 */
function passwordVersion(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 16);
}

export async function createSession(user: { id: number; passwordHash: string }) {
  const token = await new SignJWT({ sub: String(user.id), pv: passwordVersion(user.passwordHash) })
    .setProtectedHeader({ alg: JWT_ALG })
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(authSecret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HOURS * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/** Returns the logged-in user, or null. Never throws. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, authSecret(), { algorithms: [JWT_ALG] });
    const id = Number(payload.sub);
    if (!id) return null;

    const user = await prisma.user.findFirst({
      where: { id, active: true },
      include: { store: true },
    });
    if (!user) return null;
    if (payload.pv !== passwordVersion(user.passwordHash)) return null;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      storeId: user.storeId,
      storeName: user.store?.name ?? null,
      storeCode: user.store?.code ?? null,
    };
  } catch {
    return null;
  }
}

/** Use in Server Components / route handlers that must have a user. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSession();
  if (!user) throw new AuthError("UNAUTHENTICATED", 401);
  return user;
}

export { AuthError };
