// src/common/permissions.ts
// Central permission catalog. These keys are seeded into the `Permission`
// table so the owner can assign them to custom roles from the frontend.

export interface PermissionDefinition {
  key: string;
  label: string;
  group: string;
}

export const PERMISSIONS: PermissionDefinition[] = [
  { key: 'dashboard.view', label: 'View Dashboard', group: 'Dashboard' },
  { key: 'products.view', label: 'View Products', group: 'Products' },
  { key: 'products.create', label: 'Create Products', group: 'Products' },
  { key: 'products.edit', label: 'Edit Products', group: 'Products' },
  { key: 'products.delete', label: 'Delete Products', group: 'Products' },
  { key: 'products.adjust-stock', label: 'Adjust Stock', group: 'Products' },
  { key: 'categories.create', label: 'Create Categories', group: 'Categories' },
  { key: 'categories.edit', label: 'Edit Categories', group: 'Categories' },
  { key: 'categories.delete', label: 'Delete Categories', group: 'Categories' },
  { key: 'locations.manage', label: 'Manage Locations', group: 'Locations' },
  { key: 'sales.view', label: 'View Sales', group: 'Sales' },
  { key: 'sales.create', label: 'Create Sales', group: 'Sales' },
  { key: 'sales.edit', label: 'Edit Sales', group: 'Sales' },
  { key: 'sales.delete', label: 'Delete Sales', group: 'Sales' },
  { key: 'sales.return', label: 'Process Returns', group: 'Sales' },
  { key: 'sales.view-profit', label: 'View Profit & Revenue', group: 'Sales' },
  { key: 'purchases.view', label: 'View Quick Purchases', group: 'Quick Purchases' },
  { key: 'purchases.create', label: 'Create Quick Purchases', group: 'Quick Purchases' },
  { key: 'purchases.approve', label: 'Approve Quick Purchases', group: 'Quick Purchases' },
  { key: 'requests.view', label: 'View Requests', group: 'Stock Requests' },
  { key: 'requests.create', label: 'Create Requests', group: 'Stock Requests' },
  { key: 'requests.approve', label: 'Approve Requests', group: 'Stock Requests' },
  { key: 'requests.dispatch', label: 'Dispatch Requests', group: 'Stock Requests' },
  { key: 'requests.confirm', label: 'Confirm Receipt', group: 'Stock Requests' },
  { key: 'restock.create', label: 'Restock Products', group: 'Restock' },
  { key: 'credits.view', label: 'View Credits', group: 'Credits' },
  { key: 'credits.manage', label: 'Manage Credits', group: 'Credits' },
  { key: 'reports.view', label: 'View Reports', group: 'Reports' },
  { key: 'reports.full', label: 'Full Reports & Exports', group: 'Reports' },
  { key: 'prices.view', label: 'View Price History', group: 'Price History' },
  { key: 'users.view', label: 'View Users', group: 'Users' },
  { key: 'users.manage', label: 'Manage Users', group: 'Users' },
  { key: 'roles.manage', label: 'Manage Roles & Permissions', group: 'Roles' },
];

export const ALL_PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);

/** Permission sets that reproduce the old hardcoded OWNER/SHOPKEEPER/STOREKEEPER behaviour. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: ALL_PERMISSION_KEYS,
  STOREKEEPER: [
    'dashboard.view',
    'products.view',
    'products.create',
    'products.edit',
    'products.adjust-stock',
    'categories.create',
    'sales.view',
    'sales.create',
    'requests.view',
    'requests.create',
    'requests.dispatch',
    'requests.confirm',
    'restock.create',
    'credits.view',
    'credits.manage',
    'reports.view',
  ],
  SHOPKEEPER: [
    'dashboard.view',
    'products.view',
    'sales.view',
    'sales.create',
    'sales.edit',
    'sales.return',
    'purchases.view',
    'purchases.create',
    'requests.view',
    'requests.create',
    'requests.confirm',
    'credits.view',
    'credits.manage',
    'reports.view',
  ],
  // Standalone shop: the shop restocks its own inventory (owner approves via
  // restock.create + requests.confirm) and registers sales directly. No
  // store-to-shop flow — deliberately no requests.create/approve/dispatch.
  STANDALONE_SHOPKEEPER: [
    'dashboard.view',
    'products.view',
    'sales.view',
    'sales.create',
    'sales.edit',
    'sales.return',
    'restock.create',
    'requests.view',
    'requests.confirm',
    'credits.view',
    'credits.manage',
    'reports.view',
  ],
};
