import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  // Prisma config properties
  // (seed is not a valid property on the config object itself, it's a prisma/package.json thing)
});
