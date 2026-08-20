// ---------------------------------------------------------------------------
// Report response DTO / entity types
// ---------------------------------------------------------------------------

export interface InventoryBreakdownRow {
  productName: string;
  category: string;
  total: number;
  locations: Record<string, number>;
}

export interface InventoryBreakdownResponse {
  columns: string[];
  rows: InventoryBreakdownRow[];
}

export interface SalesSummaryResponse {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  returns?: { refund: number; cost: number };
  margin: string;
  topProducts: TopProduct[];
  breakdown: {
    fullyPaid: { revenue: number; cost: number; profit: number; collected: number; outstanding: number };
    partiallyPaid: { revenue: number; cost: number; profit: number; collected: number; outstanding: number };
    credited: { revenue: number; cost: number; profit: number; collected: number; outstanding: number };
  };
}

export interface SalesTrendPoint {
  date: string;
  sales: number;
  flips: number;
  collections: number;
}

export interface TopProduct {
  name: string;
  qty: number;
}

export interface LowStockProduct {
  name: string;
  total: number;
}

export interface DeadStockProduct {
  name: string;
  lastSold: string;
}

export interface AuditLogResponse {
  id: number;
  userId: number;
  action: string;
  details: string;
  createdAt: Date;
  user: {
    id: number;
    email: string;
    name: string;
  };
}

export interface PaymentMethodBreakdown {
  method: string;
  count: number;
  totalAmount: number;
}
