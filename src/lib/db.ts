import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/** Prisma Decimal -> number, safe for JSON responses. */
export function dec(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  return Number(value.toString());
}

/** Deep-convert Decimal/Date fields so Server Components can pass data to Client Components. */
export function serialize<T>(input: T): T {
  return JSON.parse(
    JSON.stringify(input, (_k, v) => {
      if (v && typeof v === "object" && "toFixed" in v && typeof v.toFixed === "function") {
        return Number(v.toString());
      }
      return v;
    })
  );
}
