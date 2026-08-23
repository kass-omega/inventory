// prisma/seed-prod.ts
// Production seed (IDEMPOTENT): safe to run on EVERY deploy without wiping
// live data. It always:
//   1. upserts the permission catalog (PERMISSIONS),
//   2. upserts the default roles by name (Owner / Storekeeper / Shopkeeper /
//      Standalone Shop) and syncs their permission links to
//      DEFAULT_ROLE_PERMISSIONS, and
//   3. creates the primary owner account only if it does not exist.
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

// Default roles kept in sync on every deploy. Owner is the locked system role;
// the rest are editable custom roles the owner manages from the app. The
// permissionKey maps each role to its DEFAULT_ROLE_PERMISSIONS entry.
const DEFAULT_ROLES: {
  name: string;
  description: string;
  isSystem: boolean;
  permissionKey: keyof typeof DEFAULT_ROLE_PERMISSIONS;
}[] = [
  {
    name: 'Owner',
    description: 'Full access to everything',
    isSystem: true,
    permissionKey: 'OWNER',
  },
  {
    name: 'Storekeeper',
    description: 'Manages store stock and dispatches',
    isSystem: false,
    permissionKey: 'STOREKEEPER',
  },
  {
    name: 'Shopkeeper',
    description: 'Runs a shop: sales, purchases, returns',
    isSystem: false,
    permissionKey: 'SHOPKEEPER',
  },
  {
    name: 'Standalone Shop',
    description:
      'Independent shop: restocks its own inventory (owner approves) and registers sales directly',
    isSystem: false,
    permissionKey: 'STANDALONE_SHOPKEEPER',
  },
];

async function main() {
  // --- 1. Permission catalog (idempotent upsert) ---
  const permissionIdByKey: Record<string, number> = {};
  for (const p of PERMISSIONS) {
    const perm = await prisma.permission.upsert({
      where: { key: p.key },
      create: { key: p.key, label: p.label, group: p.group },
      update: { label: p.label, group: p.group },
    });
    permissionIdByKey[p.key] = perm.id;
  }
  console.log(`✅ Permission catalog synced (${PERMISSIONS.length} permissions).`);

  // --- 2. Default roles + permission links (idempotent upsert + sync) ---
  // Code stays the single source of truth for default-role permissions, so a
  // role that was renamed/emptied/deleted by accident is repaired on deploy.
  for (const roleDef of DEFAULT_ROLES) {
    const role = await prisma.role.upsert({
      where: { name: roleDef.name },
      create: {
        name: roleDef.name,
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
      update: {
        description: roleDef.description,
        isSystem: roleDef.isSystem,
      },
    });

    const keys = DEFAULT_ROLE_PERMISSIONS[roleDef.permissionKey] ?? [];
    const permissionIds = keys
      .map((key) => permissionIdByKey[key])
      .filter((id): id is number => typeof id === 'number');

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permissionIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
      });
    }
    console.log(`✅ Role "${roleDef.name}" synced (${permissionIds.length} permissions).`);
  }

  // --- 3. Primary owner account (only if missing) ---
  const existingOwner = await prisma.user.findUnique({
    where: { email: OWNER.email },
  });
  if (existingOwner) {
    console.log(`Owner already exists (${OWNER.email}). Skipping owner creation.`);
    return;
  }

  const ownerRole = await prisma.role.findUnique({ where: { name: 'Owner' } });
  const hashedPassword = await bcrypt.hash(OWNER.password, 10);
  const owner = await prisma.user.create({
    data: {
      email: OWNER.email,
      password: hashedPassword,
      name: OWNER.name,
      phone: OWNER.phone,
      roleId: ownerRole?.id ?? null,
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
