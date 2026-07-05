import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import * as bcrypt from 'bcrypt';

const connectionString = process.env.DATABASE_URL;
const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL ?? 'admin@inspectflow.io';
  const password = process.env.ADMIN_PASSWORD ?? 'Admin@123456';
  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Platform Admin',
      email,
      passwordHash,
      systemRole: 'SUPER_ADMIN',
      isEmailVerified: true,
      isActive: true,
    },
  });

  console.log('');
  console.log('  ✅ SUPER_ADMIN seeded');
  console.log(`  📧 Email:    ${email}`);
  console.log(`  🔑 Password: ${password}`);
  console.log('  ⚠️  Change this password immediately after first login.');
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
