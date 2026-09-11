import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError, getSession, type SessionUser } from "./auth";
import { prisma } from "./db";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

/** Wraps a route handler: injects the session, maps thrown errors to responses. */
export function route<T>(
  handler: (ctx: { user: SessionUser; req: Request; params: T }) => Promise<Response>
) {
  return async (req: Request, context: { params: Promise<T> }) => {
    try {
      const user = await getSession();
      if (!user) return fail("Silakan masuk kembali.", 401);
      const params = (context?.params ? await context.params : {}) as T;
      return await handler({ user, req, params });
    } catch (err) {
      return toErrorResponse(err);
    }
  };
}

export function toErrorResponse(err: unknown) {
  if (err instanceof AuthError) {
    const msg = err.message.startsWith("FORBIDDEN")
      ? "Peran Anda tidak punya izin untuk tindakan ini."
      : "Sesi tidak valid.";
    return fail(msg, err.status);
  }
  if (err instanceof ZodError) {
    const first = err.errors[0];
    return fail(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "tidak valid"}`, 422);
  }
  if (err instanceof Error) {
    console.error("[api]", err);
    return fail(err.message, 400);
  }
  console.error("[api] unknown", err);
  return fail("Terjadi kesalahan tak terduga.", 500);
}

export async function audit(
  userId: number | null,
  action: string,
  entity: string,
  entityId?: string | number | null,
  meta?: unknown
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        entity,
        entityId: entityId != null ? String(entityId) : null,
        meta: meta ? (meta as object) : undefined,
      },
    });
  } catch {
    /* audit must never break the request */
  }
}

export function qp(req: Request) {
  return new URL(req.url).searchParams;
}

export function qpInt(req: Request, key: string): number | undefined {
  const v = qp(req).get(key);
  if (v === null || v === "" || v === "all") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function qpDate(req: Request, key: string): Date | undefined {
  const v = qp(req).get(key);
  if (!v) return undefined;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
