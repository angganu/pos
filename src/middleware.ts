import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { authSecret, JWT_ALG, SESSION_COOKIE } from "@/lib/secret";

const PUBLIC = new Set(["/login", "/api/auth/login"]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Extra origins allowed to call the API, e.g. "https://pos.example.com" (comma-separated). */
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Edge guard: bounces unauthenticated traffic before it reaches a page or an
 * API route. Per-route permission checks still happen server-side in each
 * handler — this is only the first gate.
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CSRF defence in depth on top of the SameSite cookie: a write must come
  // from our own pages, never from another site riding the user's cookie.
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method) && !isSameOrigin(req)) {
    return NextResponse.json({ ok: false, error: "Permintaan ditolak." }, { status: 403 });
  }

  if (PUBLIC.has(pathname)) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, authSecret(), { algorithms: [JWT_ALG] });
      valid = true;
    } catch {
      valid = false;
    }
  }

  if (valid) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Silakan masuk kembali." }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

function isSameOrigin(req: NextRequest): boolean {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;

  const origin = req.headers.get("origin");
  // Browsers always send Origin on cross-origin writes; a request without one
  // comes from a non-browser client, which cannot borrow a victim's cookie.
  if (!origin) return true;
  if (EXTRA_ORIGINS.includes(origin)) return true;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }
  const hosts = [req.headers.get("x-forwarded-host")?.split(",")[0].trim(), req.headers.get("host")];
  return hosts.some((h) => h && h === originHost);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
