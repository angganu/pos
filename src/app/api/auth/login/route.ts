import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession, PASSWORD_MAX } from "@/lib/auth";
import { ok, fail, toErrorResponse, audit, readJson } from "@/lib/api";
import { createLimiter, clientIp } from "@/lib/rate-limit";

const schema = z.object({
  email: z.string().email("Email tidak valid").max(191),
  password: z.string().min(1, "Kata sandi wajib diisi").max(PASSWORD_MAX),
});

// Brute-force brakes: per account (targeted guessing) and per IP (spraying).
const WINDOW_MS = 15 * 60 * 1000;
const byEmail = createLimiter({ limit: 5, windowMs: WINDOW_MS });
const byIp = createLimiter({ limit: 20, windowMs: WINDOW_MS });

// Hash of a random string: unknown emails cost the same bcrypt time as real
// ones, so response timing does not reveal which accounts exist.
const DUMMY_HASH = "$2a$10$MeJ/3mryJ7DHkxHv8hNsv.Cxv/x9WcV7VJfCE33VC7bYUpl.ry3mC";

export async function POST(req: Request) {
  try {
    const { email: rawEmail, password } = schema.parse(await readJson(req, 4096));
    const email = rawEmail.toLowerCase().trim();
    const ip = clientIp(req);

    const wait = Math.max(byEmail.retryAfter(email), byIp.retryAfter(ip));
    if (wait > 0) {
      return fail(`Terlalu banyak percobaan masuk. Coba lagi dalam ${Math.ceil(wait / 60)} menit.`, 429);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { store: true },
    });

    const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);

    // Same message either way — don't leak which emails exist.
    if (!user || !user.active || !passwordOk) {
      byEmail.fail(email);
      byIp.fail(ip);
      if (user) await audit(user.id, "login.failed", "User", user.id, { ip });
      return fail("Email atau kata sandi salah.", 401);
    }

    byEmail.clear(email);
    await createSession(user);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "User", user.id, { ip });

    return ok({
      id: user.id, name: user.name, email: user.email, role: user.role,
      storeId: user.storeId, storeName: user.store?.name ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
