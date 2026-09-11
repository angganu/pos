import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./db";
import type { Role } from "@prisma/client";
import { AuthError } from "./errors";

const COOKIE = "pos_session";
const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "insecure-dev-secret-change-me"
);
const HOURS = Number(process.env.SESSION_HOURS ?? 12);

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

export async function createSession(userId: number) {
  const token = await new SignJWT({ sub: String(userId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${HOURS}h`)
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: HOURS * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Returns the logged-in user, or null. Never throws. */
export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    const id = Number(payload.sub);
    if (!id) return null;

    const user = await prisma.user.findFirst({
      where: { id, active: true },
      include: { store: true },
    });
    if (!user) return null;

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
