const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { token: 'f694806f69829b118dbf131da2e6033cc36a802a1f015918232209ccac4fb704' },
    include: { organization: true },
  });
  console.log(invitation);
}
run();
