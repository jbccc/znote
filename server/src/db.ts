import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

// Connection pool is handled by Prisma, but for Postgres:
// Add ?connection_limit=20&pool_timeout=30 to DATABASE_URL if needed
