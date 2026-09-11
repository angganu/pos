import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSession } from "@/lib/auth";
import { ok, fail, toErrorResponse, audit } from "@/lib/api";

const schema = z.object({
  email: z.string().email("Email tidak valid"),
  password: z.string().min(1, "Kata sandi wajib diisi"),
});

export async function POST(req: Request) {
  try {
    const { email, password } = schema.parse(await req.json());

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: { store: true },
    });

    // Same message either way — don't leak which emails exist.
    if (!user || !user.active) return fail("Email atau kata sandi salah.", 401);
    if (!(await verifyPassword(password, user.passwordHash))) {
      await audit(user.id, "login.failed", "User", user.id);
      return fail("Email atau kata sandi salah.", 401);
    }

    await createSession(user.id);
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await audit(user.id, "login", "User", user.id);

    return ok({
      id: user.id, name: user.name, email: user.email, role: user.role,
      storeId: user.storeId, storeName: user.store?.name ?? null,
    });
  } catch (err) {
    return toErrorResponse(err);
  }
}
