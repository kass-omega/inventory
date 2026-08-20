// prisma/seed-prod.ts
// Production seed (IDEMPOTENT): seeds ONLY the primary owner account plus the
// permission catalog and Owner role. If the owner already exists it skips,
// so it is safe to run on every deploy without wiping live data.
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../src/common/permissions';

const prisma = new PrismaClient();

const OWNER = {
  name: 'Abdulkerim teka',
  email: 'kerimteka77@gmail.com',
  password: 'ABUSHowner@1234',
  phone: '+251913944545',
};

async function main() {
  const existingOwner = await prisma.user.findUnique({
    where: { email: OWNER.email },
  });
  if (existingOwner) {
    console.log(`Owner already exists (${OWNER.email}). Skipping seed — nothing to do.`);
    return;
  }

  console.log('Resetting database and seeding production owner...');

  await prisma.creditPayment.deleteMany({});
  await prisma.creditSaleItem.deleteMany({});
  await prisma.creditSale.deleteMany({});
  await prisma.customer.deleteMany({});
  await prisma.paymentMethod.deleteMany({});
  await prisma.returnItem.deleteMany({});
  await prisma.return.deleteMany({});
  await prisma.saleItem.deleteMany({});
  await prisma.sale.deleteMany({});
  await prisma.requestItem.deleteMany({});
  await prisma.stockRequest.deleteMany({});
  await prisma.purchase.deleteMany({});
  await prisma.inventory.deleteMany({});
  await prisma.priceHistory.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.unit.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.pushSubscription.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.locationCategory.deleteMany({});

  console.log('Cleared existing data.');

  // Permission catalog + system Owner role.
  const permissionIdByKey: Record<string, number> = {};
  for (const p of PERMISSIONS) {
    const created = await prisma.permission.create({
      data: { key: p.key, label: p.label, group: p.group },
    });
    permissionIdByKey[p.key] = created.id;
  }

  const ownerRole = await prisma.role.create({
    data: { name: 'Owner', description: 'Full access to everything', isSystem: true },
  });

  await prisma.rolePermission.createMany({
    data: DEFAULT_ROLE_PERMISSIONS.OWNER.map((key) => ({
      roleId: ownerRole.id,
      permissionId: permissionIdByKey[key],
    })),
  });

  console.log('Permissions and Owner role created.');

  // Primary owner account.
  const hashedPassword = await bcrypt.hash(OWNER.password, 10);
  const owner = await prisma.user.create({
    data: {
      email: OWNER.email,
      password: hashedPassword,
      name: OWNER.name,
      phone: OWNER.phone,
      roleId: ownerRole.id,
    },
  });

  console.log('Owner created: ' + owner.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
