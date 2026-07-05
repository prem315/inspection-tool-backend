import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  // DATABASE_URL is used by Prisma CLI for migrations and generate
  // At runtime, the adapter in PrismaService handles the connection
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    seed: 'npx ts-node prisma/seed.ts',
  },
});
