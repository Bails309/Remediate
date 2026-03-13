import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

let _realPrisma: PrismaClient | undefined = globalForPrisma.prisma;

function buildPrismaInstance() {
  if (_realPrisma) return _realPrisma;

  _realPrisma = new PrismaClient({ log: ["error", "warn"] });

  // In development keep the instance on globalThis to avoid multiple
  // clients during module reloads (vitest/hot-reload scenarios).
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = _realPrisma;
  }

  return _realPrisma;
}

const prismaHandler: ProxyHandler<PrismaClient> = {
  get(_, prop) {
    const real = _realPrisma ?? buildPrismaInstance();
    const value = (real as any)[prop];
    if (typeof value === "function") return value.bind(real);
    return value;
  },
  set(_, prop, val) {
    const real = _realPrisma ?? buildPrismaInstance();
    (real as any)[prop] = val;
    return true;
  },
  has(_, prop) {
    const real = _realPrisma ?? buildPrismaInstance();
    return prop in real;
  },
  ownKeys() {
    const real = _realPrisma ?? buildPrismaInstance();
    return Reflect.ownKeys(real as object);
  },
  getOwnPropertyDescriptor(_, prop) {
    const real = _realPrisma ?? buildPrismaInstance();
    return Object.getOwnPropertyDescriptor(real as object, prop as PropertyKey) || undefined;
  },
};

export const prisma = new Proxy({}, prismaHandler) as unknown as PrismaClient;
