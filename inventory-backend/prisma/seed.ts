// prisma/seed.ts
import {
  LocationType,
  PrismaClient,
  RequestItemStatus,
  RequestStatus,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_ROLE_PERMISSIONS, PERMISSIONS } from '../src/common/permissions';

if (process.env.NODE_ENV === 'production') {
  console.error(
    'Refusing to run the development seed in production. Use "npm run seed:prod" (seed-prod.ts) instead.',
  );
  process.exit(1);
}

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting comprehensive database seed...');

  // 1. Clean existing records in reverse dependency order
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
  await prisma.inventory.deleteMany({});
  await prisma.priceHistory.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.product.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.role.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.location.deleteMany({});
  await prisma.locationCategory.deleteMany({});

  console.log('🧹 Cleared existing data.');

  // 2. Hash default passwords
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 2.5 Create Permissions & Roles
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
  const storekeeperRole = await prisma.role.create({
    data: { name: 'Storekeeper', description: 'Manages store stock and dispatches' },
  });
  const shopkeeperRole = await prisma.role.create({
    data: { name: 'Shopkeeper', description: 'Runs a shop: sales, purchases, returns' },
  });
  const standaloneRole = await prisma.role.create({
    data: {
      name: 'Standalone Shop',
      description:
        'Independent shop: restocks its own inventory (owner approves) and registers sales directly',
    },
  });

  const linkRolePermissions = async (roleId: number, keys: string[]) => {
    await prisma.rolePermission.createMany({
      data: keys.map((key) => ({ roleId, permissionId: permissionIdByKey[key] })),
    });
  };

  await linkRolePermissions(ownerRole.id, DEFAULT_ROLE_PERMISSIONS.OWNER);
  await linkRolePermissions(storekeeperRole.id, DEFAULT_ROLE_PERMISSIONS.STOREKEEPER);
  await linkRolePermissions(shopkeeperRole.id, DEFAULT_ROLE_PERMISSIONS.SHOPKEEPER);
  await linkRolePermissions(standaloneRole.id, DEFAULT_ROLE_PERMISSIONS.STANDALONE_SHOPKEEPER);

  console.log('🔐 Roles & permissions created.');

  // 3. Create Location Categories
  const locCatGeneral = await prisma.locationCategory.create({
    data: { name: 'General' },
  });
  const locCatCables = await prisma.locationCategory.create({
    data: { name: 'Cables' },
  });

  // 4. Create Locations
  const nejatStore = await prisma.location.create({
    data: { name: 'Nejat Store', type: LocationType.STORE, categoryId: locCatGeneral.id },
  });
  const sosaStore = await prisma.location.create({
    data: { name: 'Sosa Store', type: LocationType.STORE, categoryId: locCatCables.id },
  });
  const ummiStore = await prisma.location.create({
    data: { name: 'Ummi Store', type: LocationType.STORE, categoryId: locCatGeneral.id },
  });

  const shop1 = await prisma.location.create({
    data: { name: 'Nejat Branch', type: LocationType.SHOP },
  });
  const shop2 = await prisma.location.create({
    data: { name: 'Sosa Branch', type: LocationType.SHOP },
  });
  const shop3 = await prisma.location.create({
    data: { name: 'Ummi Branch', type: LocationType.SHOP },
  });
  // A shop operated independently of the stores — restocks via owner approval.
  const standaloneShop = await prisma.location.create({
    data: { name: 'Standalone Shop', type: LocationType.SHOP },
  });

  console.log('📍 Locations created.');

  // 4. Create Users
  const owner = await prisma.user.create({
    data: {
      email: 'owner@inventory.com',
      password: hashedPassword,
      name: 'Abebe Bikila (Owner)',
      roleId: ownerRole.id,
    },
  });

  const storekeeper1 = await prisma.user.create({
    data: {
      email: 'storekeeper@inventory.com',
      password: hashedPassword,
      name: 'Chala Gemechu (Main Storekeeper)',
      roleId: storekeeperRole.id,
      locationId: nejatStore.id,
    },
  });

  const storekeeper2 = await prisma.user.create({
    data: {
      email: 'cablestore@inventory.com',
      password: hashedPassword,
      name: 'Taye Desta (Depot Storekeeper)',
      roleId: storekeeperRole.id,
      locationId: sosaStore.id,
    },
  });

  const shopkeeper1 = await prisma.user.create({
    data: {
      email: 'shopkeeper1@inventory.com',
      password: hashedPassword,
      name: 'Selam Tesfaye (Shop 1)',
      roleId: shopkeeperRole.id,
      locationId: shop1.id,
    },
  });

  const shopkeeper2 = await prisma.user.create({
    data: {
      email: 'shopkeeper2@inventory.com',
      password: hashedPassword,
      name: 'Kebede Alemu (Shop 2)',
      roleId: shopkeeperRole.id,
      locationId: shop2.id,
    },
  });

  const shopkeeper3 = await prisma.user.create({
    data: {
      email: 'shopkeeper3@inventory.com',
      password: hashedPassword,
      name: 'Tigist Haile (Shop 3)',
      roleId: shopkeeperRole.id,
      locationId: shop3.id,
    },
  });

  const standaloneKeeper = await prisma.user.create({
    data: {
      email: 'standalone@inventory.com',
      password: hashedPassword,
      name: 'Meron Girma (Standalone Shop)',
      roleId: standaloneRole.id,
      locationId: standaloneShop.id,
    },
  });

  console.log('👥 Users created.');

  // 5. Create Categories
  const catBulb = await prisma.category.create({
    data: { name: 'LED Bulbs & Lighting' },
  });
  const catWire = await prisma.category.create({
    data: { name: 'Electrical Wires & Cables' },
  });
  const catSwitch = await prisma.category.create({
    data: { name: 'Switches & Sockets' },
  });
  const catBreaker = await prisma.category.create({
    data: { name: 'Circuit Breakers & Protection' },
  });
  const catTools = await prisma.category.create({
    data: { name: 'Electrical Tools & Hardware' },
  });

  console.log('🏷️ Categories created.');

  // 6. Create Products
  const products = await Promise.all([
    // Bulbs
    prisma.product.create({
      data: {
        sku: 'BLB-PHILIPS-12W-SPOT',
        brand: 'Philips',
        baseName: 'LED Spotlight',
        attributes: { watt: '12W', type: 'Spot Light', holder: 'GU10' },
        currentBuyPrice: 4.5,
        currentSellPrice: 8.0,
        categoryId: catBulb.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'BLB-OSRAM-15W-HANG',
        brand: 'Osram',
        baseName: 'LED Hanging Bulb',
        attributes: { watt: '15W', type: 'Hanging', holder: 'E27' },
        currentBuyPrice: 5.0,
        currentSellPrice: 10.0,
        categoryId: catBulb.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'BLB-GE-20W-PANEL',
        brand: 'GE',
        baseName: 'Slim LED Panel Light',
        attributes: { watt: '20W', type: 'Panel', shape: 'Square' },
        currentBuyPrice: 12.0,
        currentSellPrice: 22.0,
        categoryId: catBulb.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'BLB-PHILIPS-50W-FLOOD',
        brand: 'Philips',
        baseName: 'Outdoor Flood Light',
        attributes: { watt: '50W', type: 'Floodlight', ipRating: 'IP65' },
        currentBuyPrice: 35.0,
        currentSellPrice: 60.0,
        categoryId: catBulb.id,
      },
    }),

    // Wires
    prisma.product.create({
      data: {
        sku: 'WIRE-DUCAB-2.5-3C',
        brand: 'Ducab',
        baseName: 'Copper Wire Roll',
        attributes: { size: '2.5mm', cores: '3 Core', length: '100m' },
        currentBuyPrice: 45.0,
        currentSellPrice: 75.0,
        categoryId: catWire.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'WIRE-DUCAB-1.5-1C',
        brand: 'Ducab',
        baseName: 'Single Core Building Wire',
        attributes: { size: '1.5mm', color: 'Red', length: '100m' },
        currentBuyPrice: 18.0,
        currentSellPrice: 30.0,
        categoryId: catWire.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'WIRE-ALSHEM-4.0-4C',
        brand: 'Al-Shem',
        baseName: 'Armored Power Cable',
        attributes: { size: '4.0mm', cores: '4 Core', rating: 'Heavy Duty' },
        currentBuyPrice: 120.0,
        currentSellPrice: 190.0,
        categoryId: catWire.id,
      },
    }),

    // Switches
    prisma.product.create({
      data: {
        sku: 'SWT-LEGRAND-1G1W',
        brand: 'Legrand',
        baseName: '1-Gang 1-Way Switch',
        attributes: { Gang: '1', Way: '1', Color: 'White' },
        currentBuyPrice: 2.1,
        currentSellPrice: 4.5,
        categoryId: catSwitch.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'SWT-LEGRAND-2G2W',
        brand: 'Legrand',
        baseName: '2-Gang 2-Way Switch',
        attributes: { Gang: '2', Way: '2', Color: 'White' },
        currentBuyPrice: 3.5,
        currentSellPrice: 7.0,
        categoryId: catSwitch.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'SOC-SCHNEIDER-13A-DUAL',
        brand: 'Schneider',
        baseName: 'Double Switched Socket',
        attributes: { Amps: '13A', Features: 'USB Charging' },
        currentBuyPrice: 8.5,
        currentSellPrice: 16.0,
        categoryId: catSwitch.id,
      },
    }),

    // Circuit Breakers
    prisma.product.create({
      data: {
        sku: 'BRK-ABB-16A-MCB',
        brand: 'ABB',
        baseName: 'Single Pole MCB 16A',
        attributes: { Poles: '1P', Amps: '16A', Curve: 'C-Curve' },
        currentBuyPrice: 6.0,
        currentSellPrice: 11.0,
        categoryId: catBreaker.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'BRK-ABB-32A-MCB',
        brand: 'ABB',
        baseName: 'Single Pole MCB 32A',
        attributes: { Poles: '1P', Amps: '32A', Curve: 'C-Curve' },
        currentBuyPrice: 6.5,
        currentSellPrice: 12.0,
        categoryId: catBreaker.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'BRK-SCHNEIDER-63A-RCCB',
        brand: 'Schneider',
        baseName: 'Residual Current Breaker',
        attributes: { Poles: '2P', Amps: '63A', Sensitivity: '30mA' },
        currentBuyPrice: 28.0,
        currentSellPrice: 50.0,
        categoryId: catBreaker.id,
      },
    }),

    // Tools
    prisma.product.create({
      data: {
        sku: 'TL-FLUKE-117-MULTIMETER',
        brand: 'Fluke',
        baseName: 'Digital Multimeter',
        attributes: { Display: 'Digital', CAT: 'CAT III 600V' },
        currentBuyPrice: 110.0,
        currentSellPrice: 180.0,
        categoryId: catTools.id,
      },
    }),
    prisma.product.create({
      data: {
        sku: 'TL-INGCO-STRIPPER-8IN',
        brand: 'Ingco',
        baseName: 'Automatic Wire Stripper',
        attributes: { Size: '8 Inch', Capability: '0.2-6.0mm' },
        currentBuyPrice: 7.0,
        currentSellPrice: 14.0,
        categoryId: catTools.id,
      },
    }),
  ]);

  const [
    prodSpot,
    prodHang,
    prodPanel,
    prodFlood,
    prodWire25,
    prodWire15,
    prodWireArmored,
    prodSwt1G,
    prodSwt2G,
    prodSocUsb,
    prodMcb16,
    prodMcb32,
    prodRccb63,
    prodFluke,
    prodStripper,
  ] = products;

  console.log('📦 Products created.');

  // 7. Seed Inventories
  await prisma.inventory.createMany({
    data: [
      // Main Warehouse
      { productId: prodSpot.id, locationId: nejatStore.id, quantity: 300 },
      { productId: prodHang.id, locationId: nejatStore.id, quantity: 200 },
      { productId: prodPanel.id, locationId: nejatStore.id, quantity: 80 },
      { productId: prodFlood.id, locationId: nejatStore.id, quantity: 45 },
      { productId: prodSwt1G.id, locationId: nejatStore.id, quantity: 500 },
      { productId: prodSwt2G.id, locationId: nejatStore.id, quantity: 400 },
      { productId: prodSocUsb.id, locationId: nejatStore.id, quantity: 150 },
      { productId: prodMcb16.id, locationId: nejatStore.id, quantity: 250 },
      { productId: prodMcb32.id, locationId: nejatStore.id, quantity: 200 },
      { productId: prodRccb63.id, locationId: nejatStore.id, quantity: 60 },
      { productId: prodFluke.id, locationId: nejatStore.id, quantity: 15 },
      { productId: prodStripper.id, locationId: nejatStore.id, quantity: 90 },

      // Cable Depot
      { productId: prodWire25.id, locationId: sosaStore.id, quantity: 200 },
      { productId: prodWire15.id, locationId: sosaStore.id, quantity: 350 },
      {
        productId: prodWireArmored.id,
        locationId: sosaStore.id,
        quantity: 50,
      },

      // Shop 1 (Bole)
      { productId: prodSpot.id, locationId: shop1.id, quantity: 12 },
      { productId: prodHang.id, locationId: shop1.id, quantity: 25 },
      { productId: prodWire25.id, locationId: shop1.id, quantity: 8 },
      { productId: prodSwt1G.id, locationId: shop1.id, quantity: 45 },
      { productId: prodSocUsb.id, locationId: shop1.id, quantity: 10 },
      { productId: prodFluke.id, locationId: shop1.id, quantity: 2 },

      // Shop 2 (Megenagna)
      { productId: prodSpot.id, locationId: shop2.id, quantity: 18 },
      { productId: prodPanel.id, locationId: shop2.id, quantity: 5 },
      { productId: prodWire15.id, locationId: shop2.id, quantity: 14 },
      { productId: prodMcb16.id, locationId: shop2.id, quantity: 30 },
      { productId: prodStripper.id, locationId: shop2.id, quantity: 6 },

      // Shop 3 (Merkato)
      { productId: prodFlood.id, locationId: shop3.id, quantity: 8 },
      { productId: prodWireArmored.id, locationId: shop3.id, quantity: 4 },
      { productId: prodSwt2G.id, locationId: shop3.id, quantity: 60 },
      { productId: prodRccb63.id, locationId: shop3.id, quantity: 10 },
    ],
  });

  console.log('🏭 Inventories distributed.');

  // 7.5 Seed low-stock notifications for existing data
  const lowStockEntries = [
    {
      productName: 'Ducab Copper Wire Roll (2.5mm)',
      productId: prodWire25.id,
      locationId: shop1.id,
      locationName: shop1.name,
      locationType: shop1.type,
      qty: 8,
    },
    {
      productName: 'Fluke Digital Multimeter',
      productId: prodFluke.id,
      locationId: shop1.id,
      locationName: shop1.name,
      locationType: shop1.type,
      qty: 2,
    },
    {
      productName: 'GE Slim LED Panel Light (20W)',
      productId: prodPanel.id,
      locationId: shop2.id,
      locationName: shop2.name,
      locationType: shop2.type,
      qty: 5,
    },
    {
      productName: 'Ingco Automatic Wire Stripper',
      productId: prodStripper.id,
      locationId: shop2.id,
      locationName: shop2.name,
      locationType: shop2.type,
      qty: 6,
    },
    {
      productName: 'Philips Outdoor Flood Light (50W)',
      productId: prodFlood.id,
      locationId: shop3.id,
      locationName: shop3.name,
      locationType: shop3.type,
      qty: 8,
    },
    {
      productName: 'Al-Shem Armored Power Cable (4.0mm)',
      productId: prodWireArmored.id,
      locationId: shop3.id,
      locationName: shop3.name,
      locationType: shop3.type,
      qty: 4,
    },
  ];

  for (const entry of lowStockEntries) {
    const message = `${entry.productName} is running low (${entry.qty} remaining) at ${entry.locationName}.`;

    // Owner notification
    await prisma.notification.create({
      data: {
        type: 'LOW_STOCK',
        title: 'Low Stock Alert',
        message,
        productId: entry.productId,
        locationId: entry.locationId,
        targetRoleId: ownerRole.id,
      },
    });

    // Location-specific user notification
    await prisma.notification.create({
      data: {
        type: 'LOW_STOCK',
        title: 'Low Stock Alert',
        message,
        productId: entry.productId,
        locationId: entry.locationId,
        targetRoleId: null,
        targetLocationId: entry.locationId,
      },
    });
  }

  console.log('🔔 Low-stock notifications seeded.');

  // 8. Stock Requests

  // 1. PENDING Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop1.id,
      storeId: nejatStore.id,
      status: RequestStatus.PENDING,
      createdById: shopkeeper1.id,
      items: {
        create: [
          {
            productId: prodSpot.id,
            quantityRequested: 50,
            status: RequestItemStatus.PENDING,
          },
          {
            productId: prodSocUsb.id,
            quantityRequested: 20,
            status: RequestItemStatus.PENDING,
          },
        ],
      },
    },
  });

  // 2. APPROVED Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop2.id,
      storeId: sosaStore.id,
      status: RequestStatus.APPROVED,
      createdById: shopkeeper2.id,
      approvedById: storekeeper2.id,
      items: {
        create: [
          {
            productId: prodWire25.id,
            quantityRequested: 15,
            status: RequestItemStatus.APPROVED,
          },
          {
            productId: prodWire15.id,
            quantityRequested: 25,
            status: RequestItemStatus.APPROVED,
          },
        ],
      },
    },
  });

  // 3. PARTIALLY_APPROVED Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop3.id,
      storeId: nejatStore.id,
      status: RequestStatus.PARTIALLY_APPROVED,
      createdById: shopkeeper3.id,
      approvedById: storekeeper1.id,
      items: {
        create: [
          {
            productId: prodSwt2G.id,
            quantityRequested: 100,
            status: RequestItemStatus.APPROVED,
          },
          {
            productId: prodFluke.id,
            quantityRequested: 10,
            status: RequestItemStatus.REJECTED,
          },
        ],
      },
    },
  });

  // 4. PARTIALLY_DISPATCHED Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop1.id,
      storeId: nejatStore.id,
      status: RequestStatus.PARTIALLY_DISPATCHED,
      createdById: shopkeeper1.id,
      approvedById: storekeeper1.id,
      items: {
        create: [
          {
            productId: prodHang.id,
            quantityRequested: 30,
            status: RequestItemStatus.DISPATCHED,
          },
          {
            productId: prodSwt1G.id,
            quantityRequested: 50,
            status: RequestItemStatus.APPROVED,
          },
        ],
      },
    },
  });

  // 5. REJECTED Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop3.id,
      storeId: nejatStore.id,
      status: RequestStatus.REJECTED,
      createdById: shopkeeper3.id,
      items: {
        create: [
          {
            productId: prodMcb32.id,
            quantityRequested: 40,
            status: RequestItemStatus.REJECTED,
          },
        ],
      },
    },
  });

  // 6. COMPLETED Request
  await prisma.stockRequest.create({
    data: {
      shopId: shop2.id,
      storeId: nejatStore.id,
      status: RequestStatus.COMPLETED,
      createdById: shopkeeper2.id,
      approvedById: storekeeper1.id,
      items: {
        create: [
          {
            productId: prodPanel.id,
            quantityRequested: 10,
            status: RequestItemStatus.DISPATCHED,
          },
          {
            productId: prodMcb16.id,
            quantityRequested: 20,
            status: RequestItemStatus.DISPATCHED,
          },
        ],
      },
    },
  });

  console.log('📋 Stock Requests created.');

  // 9. Generate Historical Sales
  const generateSale = async (
    shopId: number,
    soldById: number,
    itemsData: Array<{ prod: typeof prodSpot; qty: number }>,
  ) => {
    let totalAmount = 0;
    let totalCost = 0;

    const items = itemsData.map(({ prod, qty }) => {
      const lineSell = prod.currentSellPrice * qty;
      const lineCost = prod.currentBuyPrice * qty;
      totalAmount += lineSell;
      totalCost += lineCost;

      return {
        productId: prod.id,
        quantity: qty,
        unitSellPrice: prod.currentSellPrice,
        unitBuyPrice: prod.currentBuyPrice,
      };
    });

    const profit = totalAmount - totalCost;

    return await prisma.sale.create({
      data: {
        invoiceNumber: `INV-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        shopId,
        soldById,
        totalAmount,
        totalCost,
        profit,
        items: {
          createMany: {
            data: items,
          },
        },
      },
    });
  };

  // Multiple sales across different branches
  await generateSale(shop1.id, shopkeeper1.id, [
    { prod: prodSpot, qty: 4 },
    { prod: prodSwt1G, qty: 10 },
  ]);

  await generateSale(shop1.id, shopkeeper1.id, [
    { prod: prodWire25, qty: 2 },
    { prod: prodSocUsb, qty: 3 },
  ]);

  await generateSale(shop2.id, shopkeeper2.id, [
    { prod: prodPanel, qty: 2 },
    { prod: prodMcb16, qty: 12 },
    { prod: prodStripper, qty: 1 },
  ]);

  await generateSale(shop3.id, shopkeeper3.id, [
    { prod: prodFlood, qty: 3 },
    { prod: prodWireArmored, qty: 1 },
    { prod: prodRccb63, qty: 2 },
  ]);

  await generateSale(shop1.id, shopkeeper1.id, [
    { prod: prodFluke, qty: 1 },
    { prod: prodHang, qty: 8 },
  ]);

  await generateSale(shop2.id, shopkeeper2.id, [
    { prod: prodSwt2G, qty: 25 },
    { prod: prodMcb32, qty: 10 },
  ]);

  await generateSale(shop3.id, shopkeeper3.id, [
    { prod: prodWire15, qty: 5 },
    { prod: prodSwt1G, qty: 30 },
  ]);

  console.log('🛍️ Sales generated.');

  // 10. Price History Entries
  await prisma.priceHistory.createMany({
    data: [
      {
        productId: prodSpot.id,
        oldBuyPrice: 4.0,
        newBuyPrice: 4.5,
        oldSellPrice: 7.5,
        newSellPrice: 8.0,
        updatedById: owner.id,
      },
      {
        productId: prodFluke.id,
        oldBuyPrice: 100.0,
        newBuyPrice: 110.0,
        oldSellPrice: 165.0,
        newSellPrice: 180.0,
        updatedById: owner.id,
      },
    ],
  });

  console.log('📈 Price History seeded.');

  // 11. Payment Methods
  const pmCash = await prisma.paymentMethod.create({ data: { name: 'Cash' } });
  const pmCBE = await prisma.paymentMethod.create({ data: { name: 'CBE' } });
  const pmTelebirr = await prisma.paymentMethod.create({ data: { name: 'Telebirr' } });
  console.log('💳 Payment methods created.');

  // 12. Update existing sales with payment info
  const allSales = await prisma.sale.findMany({ take: 7 });
  for (let i = 0; i < allSales.length; i++) {
    await prisma.sale.update({
      where: { id: allSales[i].id },
      data: { paymentMethodId: i % 3 === 0 ? pmCash.id : i % 3 === 1 ? pmCBE.id : pmTelebirr.id, paidAmount: allSales[i].totalAmount },
    });
  }

  // 13. Customers
  const custAbebe = await prisma.customer.create({ data: { name: 'Abebe Kebede', phone: '0911223344' } });
  const custChala = await prisma.customer.create({ data: { name: 'Chala Deresa', phone: '0922334455' } });
  const custMeron = await prisma.customer.create({ data: { name: 'Meron Alemu', phone: '0913445566' } });
  const custHana = await prisma.customer.create({ data: { name: 'Hana Bekele', phone: '0915667788' } });
  console.log('👥 Customers created.');

  // 14. Credit Sales with items
  const cs1 = await prisma.creditSale.create({
    data: {
      customerId: custAbebe.id, shopId: shop1.id, totalAmount: 1200,
      items: { create: [
        { productId: prodSpot.id, quantity: 4, unitPrice: prodSpot.currentSellPrice },
        { productId: prodWire25.id, quantity: 2, unitPrice: prodWire25.currentSellPrice },
      ]},
    },
  });
  const cs2 = await prisma.creditSale.create({
    data: {
      customerId: custAbebe.id, shopId: shop2.id, totalAmount: 1500,
      items: { create: [{ productId: prodSocUsb.id, quantity: 3, unitPrice: prodSocUsb.currentSellPrice }]},
    },
  });
  const cs3 = await prisma.creditSale.create({
    data: {
      customerId: custAbebe.id, shopId: shop1.id, totalAmount: 750,
      items: { create: [
        { productId: prodMcb16.id, quantity: 1, unitPrice: prodMcb16.currentSellPrice },
        { productId: prodSwt1G.id, quantity: 2, unitPrice: prodSwt1G.currentSellPrice },
      ]},
    },
  });
  const cs4 = await prisma.creditSale.create({
    data: {
      customerId: custChala.id, shopId: shop1.id, totalAmount: 800,
      items: { create: [{ productId: prodFlood.id, quantity: 2, unitPrice: prodFlood.currentSellPrice }]},
    },
  });
  const cs5 = await prisma.creditSale.create({
    data: {
      customerId: custMeron.id, shopId: shop3.id, totalAmount: 3200,
      items: { create: [
        { productId: prodFluke.id, quantity: 1, unitPrice: prodFluke.currentSellPrice },
        { productId: prodPanel.id, quantity: 1, unitPrice: prodPanel.currentSellPrice },
        { productId: prodWireArmored.id, quantity: 3, unitPrice: prodWireArmored.currentSellPrice },
      ]},
    },
  });
  const cs6 = await prisma.creditSale.create({
    data: {
      customerId: custMeron.id, shopId: shop2.id, totalAmount: 1900,
      items: { create: [
        { productId: prodRccb63.id, quantity: 2, unitPrice: prodRccb63.currentSellPrice },
        { productId: prodMcb32.id, quantity: 5, unitPrice: prodMcb32.currentSellPrice },
      ]},
    },
  });
  console.log('📦 Credit sales created.');

  // 15. Credit Payments
  await prisma.creditPayment.create({ data: { customerId: custAbebe.id, amount: 500, notes: 'Paid via CBE', paidAt: new Date('2026-08-04') } });
  await prisma.creditPayment.create({ data: { customerId: custAbebe.id, amount: 500, notes: 'Cash', paidAt: new Date('2026-07-25') } });
  await prisma.creditPayment.create({ data: { customerId: custChala.id, amount: 800, notes: 'Telebirr - full payment', paidAt: new Date('2026-08-05') } });
  await prisma.creditPayment.create({ data: { customerId: custMeron.id, amount: 2000, notes: 'Partial via CBE', paidAt: new Date('2026-08-01') } });
  console.log('💰 Credit payments created.');

  console.log('✅ Database Seeding Complete! 🎉');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
