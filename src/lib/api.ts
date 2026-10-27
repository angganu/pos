import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { AuthError, getSession, type SessionUser } from "./auth";
import { HttpError } from "./errors";
import { prisma } from "./db";

const GENERIC_ERROR = "Terjadi kesalahan pada server. Silakan coba lagi.";

/** Prisma error codes that are the user's fault, mapped to safe messages. */
const PRISMA_ERRORS: Record<string, [number, string]> = {
  P2000: [400, "Isian terlalu panjang."],
  P2002: [409, "Data dengan kode atau nilai yang sama sudah ada."],
  P2003: [400, "Data terkait tidak valid atau masih dipakai."],
  P2025: [404, "Data tidak ditemukan."],
  P2028: [503, "Database terlalu lama merespons, jadi transaksi dibatalkan dan tidak ada yang tersimpan. Silakan coba lagi."],
};

const MAX_JSON_BYTES = 1024 * 1024;

/** req.json() with a size cap — route handlers have no body limit of their own. */
export async function readJson(req: Request, maxBytes = MAX_JSON_BYTES): Promise<unknown> {
  const tooLarge = () => new HttpError("Data yang dikirim terlalu besar.", 413);
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw tooLarge();
  if (!req.body) throw new HttpError("Format permintaan tidak valid.", 400);

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError("Format permintaan tidak valid.", 400);
  }
}

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
  if (err instanceof HttpError) return fail(err.message, err.status);
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(`${first?.path.join(".") ?? "input"}: ${first?.message ?? "tidak valid"}`, 422);
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && PRISMA_ERRORS[err.code]) {
    const [status, message] = PRISMA_ERRORS[err.code];
    return fail(message, status);
  }
  // Handlers report business-rule violations with a plain `throw new Error("…")`,
  // so that message is meant for the user. Anything else (Prisma internals,
  // TypeError, …) can leak table names, queries or code paths — log it only.
  if (err instanceof Error && err.constructor === Error) {
    return fail(err.message, 400);
  }
  console.error("[api]", err);
  return fail(GENERIC_ERROR, 500);
}

/**
 * Two documents posted at the same moment draw the same sequential code and the
 * later insert hits the unique key. Running it again picks the next free code — or,
 * when both were made from the same PO, lets its checks report that it was just taken.
 */
export async function retryOnCodeClash<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const clash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
      if (!clash || attempt >= 5) throw err;
      // A short random pause, so the documents that clashed don't all retry in step.
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 40 * attempt));
    }
  }
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
