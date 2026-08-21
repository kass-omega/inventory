"use client";
import BarcodeScanner from "@/app/components/BarcodeScanner";
import CustomerForm from "@/app/components/CustomerForm";
import SearchableSelect from "@/app/components/SearchableSelect";
import { getDateRange } from "@/app/components/DateFilter";
import FilterPanel from "@/app/components/FilterPanel";
import Modal from "@/app/components/Modal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/app/components/ToastProvider";
import api, { markHandled } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";

interface Product {
  id: number;
  sku: string;
  brand: string;
  baseName: string;
  currentBuyPrice: number;
  currentSellPrice: number;
  inventory: Array<{ productId: number; locationId: number; quantity: number }>;
  category: { id: number; name: string } | null;
  unit: { id: number; name: string } | null;
}

interface CartItem {
  productId: string;
  quantity: number;
  customPrice: string;
  search: string;
  catFilter: string;
}

type DatePreset = "today" | "week" | "month" | "year";

export default function SalesPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const [sales, setSales] = useState([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([
    { productId: "", quantity: 1, customPrice: "", search: "", catFilter: "" },
  ]);

  // Product filters for the dropdown
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [startDate, setStartDate] = useState(() => getDateRange("month").start);
  const [endDate, setEndDate] = useState(() => getDateRange("month").end);

  // Payment & credit
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [saleType, setSaleType] = useState<
    "FULLY_PAID" | "PARTIALLY_PAID" | "CREDITED"
  >("FULLY_PAID");
  const [ownerShopId, setOwnerShopId] = useState("");
  const [shops, setShops] = useState<any[]>([]);
  const [newMethodName, setNewMethodName] = useState("");
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [purchaseStats, setPurchaseStats] = useState<any>(null);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returningSale, setReturningSale] = useState<any>(null);
  const [returnItems, setReturnItems] = useState<
    { productId: number; quantity: number }[]
  >([]);
  const [returnReason, setReturnReason] = useState("");
  const [returns, setReturns] = useState<any[]>([]);
  const [tab, setTab] = useState<"sales" | "payments">("sales");
  const [viewingSale, setViewingSale] = useState<any>(null);

  const isOwner = user?.isSuperuser === true;
  const canViewProfit = hasPermission("sales.view-profit");

  const fetchSales = async () => {
    const res = await api.get("/sales");
    setSales(res.data);
  };

  const fetchProducts = async () => {
    const locParam = isOwner && ownerShopId ? `&locationId=${ownerShopId}` : "";
    const res = await api.get(
      `/products?search=${search}&categoryId=${categoryFilter}${locParam}`,
    );
    setProducts(res.data);
  };

  const fetchCategories = async () => {
    const [catRes, locRes] = await Promise.all([
      api.get("/categories"),
      isOwner
        ? api.get("/locations").catch(() => ({ data: [] }))
        : Promise.resolve({ data: [] }),
    ]);
    setCategories(catRes.data);
    setLocations(locRes.data);
    setShops(locRes.data.filter((l: any) => l.type === "SHOP"));
  };

  useEffect(() => {
    fetchSales();
    fetchCategories();
    api.get("/payment-methods").then((r) => setPaymentMethods(r.data));
    api.get("/customers").then((r) => setCustomers(r.data));
  }, []);

  useEffect(() => {
    if (!canViewProfit) return;
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    if (locationFilter) params.set("locationId", locationFilter);
    if (categoryFilter) params.set("categoryId", categoryFilter);
    if (search) params.set("search", search);
    api
      .get(`/reports/unified-stats?${params}`)
      .then((r) => setPurchaseStats(r.data))
      .catch((err) => console.error("Stats failed:", err));
  }, [startDate, endDate, locationFilter, categoryFilter, search, canViewProfit]);

  useEffect(() => {
    if (showForm) fetchProducts();
  }, [search, categoryFilter, showForm, ownerShopId]);

  // Filter sales client-side by date, location, category and search
  const filteredSales = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales.filter((s: any) => {
      if (locationFilter && String(s.shopId) !== locationFilter) return false;
      if (startDate && endDate) {
        const saleDate = s.saleDate?.slice(0, 10) || "";
        if (saleDate < startDate || saleDate > endDate) return false;
      }
      if (categoryFilter) {
        const matchesCategory = s.items?.some(
          (i: any) => String(i.product?.categoryId) === categoryFilter,
        );
        if (!matchesCategory) return false;
      }
      if (q) {
        const haystack = [
          s.invoiceNumber || "",
          s.customer?.name || "",
          s.purchase?.productName || "",
          ...(s.items || []).map(
            (i: any) => `${i.product?.brand || ""} ${i.product?.baseName || ""}`,
          ),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [sales, locationFilter, startDate, endDate, categoryFilter, search]);

  // Payment method totals from the filtered sales (shared filters)
  const paymentBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of filteredSales as any[]) {
      const name =
        s.saleType === "CREDITED"
          ? "Credit"
          : s.paymentMethod?.name || "Unspecified";
      map.set(name, (map.get(name) || 0) + s.totalAmount);
    }
    return Array.from(map.entries())
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total);
  }, [filteredSales]);

  const resetForm = () => {
    setCart([
      {
        productId: "",
        quantity: 1,
        customPrice: "",
        search: "",
        catFilter: "",
      },
    ]);
    setEditing(null);
    setShowForm(false);
    setSearch("");
    setCategoryFilter("");
    setPaymentMethodId("");
    setPaidAmount("");
    setCustomerId("");
    setSaleType("FULLY_PAID");
    setOwnerShopId("");
  };

  const getStockForProduct = (productId: number | string): number => {
    const id = Number(productId);
    if (!id) return 0;
    const product = products.find((p) => p.id === id);
    if (!product || !product.inventory) return 0;
    // For owners with a selected shop, inventory is already filtered by the API
    // For shopkeepers, inventory is filtered to their location
    return product.inventory.reduce((sum, inv) => sum + inv.quantity, 0);
  };

  const handleSale = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // Validate payment method
    if (
      (saleType === "FULLY_PAID" || saleType === "PARTIALLY_PAID") &&
      !paymentMethodId
    ) {
      setErrorMsg("Payment method is required for paid sales.");
      return;
    }
    if (
      saleType === "PARTIALLY_PAID" &&
      (!paidAmount || Number(paidAmount) <= 0)
    ) {
      setErrorMsg("Paid amount must be greater than 0 for partially paid.");
      return;
    }

    const items = cart
      .map((c) => ({
        productId: Number(c.productId),
        quantity: Number(c.quantity),
        customPrice: c.customPrice ? Number(c.customPrice) : undefined,
      }))
      .filter((c) => c.productId);
    if (items.length === 0) {
      toast.error("Add at least one item");
      return;
    }

    for (const item of items) {
      const stock = getStockForProduct(item.productId);
      if (item.quantity > stock) {
        const prod = products.find((p) => p.id === item.productId);
        toast.error(
          `Cannot sell ${item.quantity}x "${prod?.brand} ${prod?.baseName}". Only ${stock} in stock.`,
        );
        return;
      }
    }

    try {
      if (editing) {
        await api.put(`/sales/${editing.id}`, {
          items,
          saleType,
          paidAmount:
            saleType === "PARTIALLY_PAID" && paidAmount
              ? Number(paidAmount)
              : undefined,
          paymentMethodId: paymentMethodId
            ? Number(paymentMethodId)
            : undefined,
          customerId: customerId ? Number(customerId) : undefined,
          shopId: isOwner && ownerShopId ? Number(ownerShopId) : undefined,
        });
      } else
        await api.post("/sales", {
          items,
          saleType,
          paidAmount:
            saleType !== "CREDITED" && paidAmount
              ? Number(paidAmount)
              : undefined,
          paymentMethodId: paymentMethodId
            ? Number(paymentMethodId)
            : undefined,
          customerId: customerId ? Number(customerId) : undefined,
          shopId: isOwner && ownerShopId ? Number(ownerShopId) : undefined,
        });
      resetForm();
      fetchSales();
    } catch (err: any) {
      markHandled(err);
      toast.error("Error processing sale.");
    }
  };

  const handleScanSku = (index: number, sku: string) => {
    const product = products.find(
      (p) => p.sku.toLowerCase() === sku.toLowerCase(),
    );
    if (!product) {
      toast.error(`No product found for "${sku}"`);
      return;
    }
    setCart((prev) => {
      const next = prev.map((c, i) =>
        i === index ? { ...c, productId: String(product.id) } : c,
      );
      if (index === prev.length - 1) {
        next.push({
          productId: "",
          quantity: 1,
          customPrice: "",
          search: "",
          catFilter: "",
        });
      }
      return next;
    });
  };

  const startReturn = (sale: any) => {
    setReturningSale(sale);
    setReturnItems(
      sale.items.map((i: any) => ({ productId: i.productId, quantity: 0 })),
    );
    setReturnReason("");
    setShowReturnModal(true);
  };

  const handleReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningSale) return;
    const items = returnItems.filter((i) => i.quantity > 0);
    if (items.length === 0) {
      toast.error("Enter at least one returned quantity.");
      return;
    }
    try {
      await api.post(`/sales/${returningSale.id}/return`, {
        items,
        reason: returnReason || undefined,
      });
      toast.success("Return processed.");
      setShowReturnModal(false);
      setReturningSale(null);
      fetchSales();
      api.get("/sales/returns").then((r) => setReturns(r.data));
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to process return.");
    }
  };

  useEffect(() => {
    api
      .get("/sales/returns")
      .then((r) => setReturns(r.data))
      .catch(() => {});
  }, []);

  const startEdit = (sale: any) => {
    setEditing(sale);
    setShowForm(true);
    setCart(
      sale.items.map((i: any) => ({
        productId: String(i.productId),
        quantity: i.quantity,
        customPrice: "",
        search: "",
        catFilter: "",
      })),
    );
    setSaleType(sale.saleType || "FULLY_PAID");
    setPaymentMethodId(
      sale.paymentMethodId ? String(sale.paymentMethodId) : "",
    );
    setCustomerId(sale.customerId ? String(sale.customerId) : "");
    setPaidAmount(
      sale.saleType === "PARTIALLY_PAID" ? String(sale.paidAmount) : "",
    );
    if (isOwner && sale.shopId) setOwnerShopId(String(sale.shopId));
  };

  const filteredProducts = useMemo(() => {
    if (!search) return products;
    const term = search.toLowerCase();
    return products.filter(
      (p) =>
        p.brand.toLowerCase().includes(term) ||
        p.baseName.toLowerCase().includes(term) ||
        p.sku.toLowerCase().includes(term),
    );
  }, [products, search]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 w-full max-w-full gap-2">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 whitespace-nowrap">
          Sales
        </h1>
        {purchaseStats && canViewProfit && (
          <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-500 whitespace-nowrap overflow-x-auto">
            <span>
              Revenue{" "}
              <strong className="text-gray-800">
                {purchaseStats.sales.revenue.toFixed(0)} birr
              </strong>
            </span>
            <span className="text-gray-300">|</span>
            <span>
              Profit{" "}
              <strong
                className={
                  purchaseStats.combined.netProfit >= 0
                    ? "text-green-600"
                    : "text-red-500"
                }
              >
                {purchaseStats.combined.netProfit.toFixed(0)} birr
              </strong>
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
        {(["sales", "payments"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === t
                ? "bg-white shadow text-blue-700"
                : "text-gray-600 hover:text-gray-800"
            }`}
          >
            {t === "sales" ? "Sales" : "Payment Methods"}
          </button>
        ))}
      </div>

      {/* Filter Panel */}
      <FilterPanel
        showDateFilter
        datePreset={datePreset}
        onDatePresetChange={setDatePreset}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        category={categoryFilter}
        onCategoryChange={setCategoryFilter}
        categories={categories}
        location={locationFilter}
        onLocationChange={setLocationFilter}
        locations={locations}
        showLocation={isOwner}
      />

      {tab === "sales" && (
        <div className="flex justify-between items-center mb-6 w-full max-w-full">
          <div className="flex w-full items-center justify-end gap-2 flex-wrap">
            <button
              onClick={() => {
                setEditing(null);
                setSaleType("FULLY_PAID");
                setShowForm(true);
              }}
              className="bg-green-600 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-green-700 whitespace-nowrap"
            >
              + Cash Sale
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setSaleType("PARTIALLY_PAID");
                setShowForm(true);
              }}
              className="bg-amber-500 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-amber-600 whitespace-nowrap"
            >
              + Partial
            </button>
            <button
              onClick={() => {
                setEditing(null);
                setSaleType("CREDITED");
                setShowForm(true);
              }}
              className="bg-red-500 text-white px-3 py-2 rounded-lg text-xs sm:text-sm font-medium hover:bg-red-600 whitespace-nowrap"
            >
              + Credit
            </button>
          </div>
        </div>
      )}

      <Modal
        isOpen={showForm}
        onClose={resetForm}
        title={
          editing
            ? `Edit Sale #${editing.id}`
            : saleType === "FULLY_PAID"
              ? "Record Cash Sale"
              : saleType === "PARTIALLY_PAID"
                ? "Record Partial Payment"
                : "Record Credit Sale"
        }
      >
        <form onSubmit={handleSale} className="grid grid-cols-1 gap-4">
          {/* Owner Shop Selector — must be first */}
          {isOwner && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Shop Location
              </label>
              <SearchableSelect
                options={shops.map((s: any) => ({
                  value: String(s.id),
                  label: s.name,
                }))}
                value={ownerShopId}
                onChange={setOwnerShopId}
                placeholder="Search shop..."
                required
              />
            </div>
          )}

          {/* Running Total */}
          <div className="bg-gray-50 p-3 rounded-lg text-center border">
            <span className="text-sm text-gray-500">Total: </span>
            <span className="text-xl font-bold text-gray-800">
              $
              {(() => {
                let t = 0;
                cart.forEach((c) => {
                  if (!c.productId) return;
                  const p = products.find(
                    (p: any) => p.id === Number(c.productId),
                  );
                  const price = c.customPrice
                    ? Number(c.customPrice)
                    : p?.currentSellPrice || 0;
                  t += price * Number(c.quantity || 1);
                });
                return t.toFixed(2);
              })()}
            </span>
          </div>

          {cart.map((item, index) => {
            const selectedProduct = products.find(
              (p) => p.id === Number(item.productId),
            );
            const stock = getStockForProduct(item.productId);
            const exceedsStock =
              item.productId && Number(item.quantity) > stock;
            const itemProducts = products.filter(
              (p) => !item.catFilter || String(p.category?.id) === item.catFilter,
            );

            return (
              <div
                key={index}
                className="p-3 bg-gray-50 rounded-lg border gap-2"
              >
                <div className="flex gap-2 mb-2 items-end">
                  <div className="w-28">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Category
                    </label>
                    <select
                      value={item.catFilter}
                      onChange={(e) =>
                        setCart(
                          cart.map((c, i) =>
                            i === index
                              ? { ...c, catFilter: e.target.value }
                              : c,
                          ),
                        )
                      }
                      className="border p-2 rounded-lg bg-white text-sm w-full"
                    >
                      <option value="">All</option>
                      {categories.map((c: any) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      Product
                    </label>
                    <SearchableSelect
                      options={itemProducts.map((p) => ({
                        value: String(p.id),
                        label: `${p.brand} ${p.baseName} — ${getStockForProduct(p.id)}${
                          p.unit ? " " + p.unit.name : ""
                        }`,
                        searchText: `${p.brand} ${p.baseName} ${p.sku}`,
                        disabled: cart.some(
                          (c, i) => c.productId === String(p.id) && i !== index,
                        ),
                      }))}
                      value={item.productId}
                      onChange={(v) =>
                        setCart(
                          cart.map((c, i) =>
                            i === index ? { ...c, productId: v } : c,
                          ),
                        )
                      }
                      placeholder="Search product..."
                      required
                      className="w-full"
                    />
                  </div>
                  <BarcodeScanner onScan={(sku) => handleScanSku(index, sku)} />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">
                      Qty
                    </label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max={stock || undefined}
                        value={item.quantity}
                        onChange={(e) =>
                          setCart(
                            cart.map((c, i) =>
                              i === index
                                ? { ...c, quantity: Number(e.target.value) }
                                : c,
                            ),
                          )
                        }
                        className={
                          "border p-2 rounded-lg flex-1 text-sm " +
                          (exceedsStock ? "border-red-500 bg-red-50" : "")
                        }
                        required
                      />
                      {selectedProduct?.unit && (
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {selectedProduct.unit.name}
                        </span>
                      )}
                    </div>
                    {item.productId && (
                      <p
                        className={
                          "text-[10px] mt-0.5 " +
                          (exceedsStock
                            ? "text-red-500 font-semibold"
                            : "text-gray-400")
                        }
                      >
                        {exceedsStock ? "Max: " + stock : "Stock: " + stock}
                      </p>
                    )}
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-0.5">
                      Price
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={item.customPrice}
                      onChange={(e) =>
                        setCart(
                          cart.map((c, i) =>
                            i === index
                              ? { ...c, customPrice: e.target.value }
                              : c,
                          ),
                        )
                      }
                      placeholder={
                        selectedProduct
                          ? selectedProduct.currentSellPrice.toFixed(2)
                          : ""
                      }
                      className="border p-2 rounded-lg w-full text-sm"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCart(cart.filter((_, i) => i !== index))}
                    className="text-red-400 hover:text-red-600 text-xl font-bold leading-none mb-1 flex-shrink-0"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() =>
                setCart([
                  ...cart,
                  {
                    productId: "",
                    quantity: 1,
                    customPrice: "",
                    search: "",
                    catFilter: "",
                  },
                ])
              }
              className="text-sm text-blue-600 font-medium"
            >
              + Add Item
            </button>
          </div>

          <div className="border-t pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Running Total */}

            {/* Sale Type — only shown when editing */}
            {editing && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Payment Type
                </label>
                <div className="flex gap-2">
                  {(["FULLY_PAID", "PARTIALLY_PAID", "CREDITED"] as const).map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSaleType(t)}
                        className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-medium border ${
                          saleType === t
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300"
                        }`}
                      >
                        {t === "FULLY_PAID"
                          ? "Fully Paid"
                          : t === "PARTIALLY_PAID"
                            ? "Partial"
                            : "Credited"}
                      </button>
                    ),
                  )}
                </div>
              </div>
            )}

            {/* Payment Method — only for paid/partial */}
            {(saleType === "FULLY_PAID" || saleType === "PARTIALLY_PAID") && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Payment Method
                </label>
                <div className="flex gap-2">
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className="border p-2 rounded-lg flex-1 bg-white text-sm"
                  >
                    <option value="">Cash</option>
                    {paymentMethods.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    placeholder="New"
                    value={newMethodName}
                    onChange={(e) => setNewMethodName(e.target.value)}
                    className="border p-2 rounded-lg w-24 text-sm"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      if (!newMethodName.trim()) return;
                      const r = await api.post("/payment-methods", {
                        name: newMethodName.trim(),
                      });
                      setPaymentMethods([...paymentMethods, r.data]);
                      setPaymentMethodId(String(r.data.id));
                      setNewMethodName("");
                    }}
                    className="bg-gray-200 px-2 rounded-lg text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            )}

            {/* Paid Amount — only for partial */}
            {saleType === "PARTIALLY_PAID" && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Paid Amount (birr)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="border p-2 rounded-lg w-full text-sm"
                  placeholder="Amount paid now"
                />
              </div>
            )}

            {/* Customer — for partial and credited */}
            {(saleType === "PARTIALLY_PAID" || saleType === "CREDITED") && (
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  Customer
                </label>
                <div className="flex gap-2">
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="border p-2 rounded-lg flex-1 bg-white text-sm"
                    required
                  >
                    <option value="">Select Customer</option>
                    {customers.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone ? "· " + c.phone : ""}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(true)}
                    className="bg-gray-200 px-3 rounded-lg text-xs whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 font-medium text-sm"
          >
            {editing ? "Update Sale" : "Complete Sale"}
          </button>
          {errorMsg && <p className="text-red-500 text-xs mt-1">{errorMsg}</p>}
        </form>
      </Modal>

      <Modal
        isOpen={showCustomerModal}
        onClose={() => setShowCustomerModal(false)}
        title="New Customer"
      >
        <CustomerForm
          onCreated={(cust) => {
            setCustomers([...customers, cust]);
            setCustomerId(String(cust.id));
            setShowCustomerModal(false);
          }}
          onCancel={() => setShowCustomerModal(false)}
        />
      </Modal>
      {tab === "sales" && (<>
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left min-w-max text-xs sm:text-sm whitespace-nowrap">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">Invoice #</th>
              <th className="p-2 sm:p-3 md:p-4">Date</th>
              {isOwner && <th className="p-2 sm:p-3 md:p-4">Shop</th>}
              <th className="p-2 sm:p-3 md:p-4">
                <span className="block">Items</span>
                <span className="mt-0.5 flex text-[10px] uppercase font-medium text-gray-400">
                  <span className="flex-1 text-center">Name</span>
                  <span className="w-10 text-center">Qty</span>
                </span>
              </th>
              <th className="p-2 sm:p-3 md:p-4">Total</th>
              <th className="p-2 sm:p-3 md:p-4">Status</th>
              {canViewProfit && <th className="p-2 sm:p-3 md:p-4">Profit</th>}
              <th className="p-2 sm:p-3 md:p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredSales.map((s: any) => (
              <tr key={s.id} onClick={() => setViewingSale(s)} className="border-b hover:bg-gray-50 cursor-pointer">
                <td className="p-2 sm:p-3 md:p-4 font-mono text-xs sm:text-sm">
                  {s.invoiceNumber}
                  {s.purchaseId && (
                    <span className="ml-2 px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded font-sans font-semibold">
                      Quick flip
                    </span>
                  )}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-500">
                  {s.saleDate?.slice(0, 10) || "—"}
                </td>
                {isOwner && (
                  <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm">
                    {s.shop?.name}
                  </td>
                )}
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-700">
                  {s.items.length === 0 && s.purchase ? (
                    <table className="w-full">
                      <tbody>
                        <tr>
                          <td className="py-1 pr-3 whitespace-nowrap">{s.purchase.productName}</td>
                          <td className="py-1 w-10 whitespace-nowrap text-gray-500">{s.purchase.quantity}</td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <table className="w-full">
                      <tbody>
                        {s.items.map((i: any, idx: number) => (
                          <tr key={idx} className={idx > 0 ? "border-t border-gray-200" : ""}>
                            <td className="py-1 pr-3 whitespace-nowrap">{i.product.baseName}</td>
                            <td className="py-1 w-10 whitespace-nowrap text-gray-500">{i.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </td>
                <td className="p-2 sm:p-3 md:p-4 font-semibold text-xs sm:text-sm">
                  ${s.totalAmount.toFixed(2)}
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-full font-semibold ${
                      s.saleType === "FULLY_PAID"
                        ? "bg-green-100 text-green-800"
                        : s.saleType === "PARTIALLY_PAID"
                          ? "bg-yellow-100 text-yellow-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {s.saleType === "FULLY_PAID"
                      ? "Paid"
                      : s.saleType === "PARTIALLY_PAID"
                        ? "Partial"
                        : "Credit"}
                  </span>
                  {s.paymentMethod && (
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {s.paymentMethod.name}
                    </div>
                  )}
                </td>
                {canViewProfit && (
                  <td className="p-2 sm:p-3 md:p-4 text-green-600 font-semibold text-xs sm:text-sm">
                    ${s.profit.toFixed(2)}
                  </td>
                )}
                <td className="p-2 sm:p-3 md:p-4" onClick={(e) => e.stopPropagation()}>
                  <RowActionsMenu
                    items={[
                      { label: "View", onClick: () => setViewingSale(s) },
                      { label: "Edit", onClick: () => startEdit(s) },
                      {
                        label: "Return",
                        color: "text-red-600",
                        onClick: () => startReturn(s),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {filteredSales.length === 0 && (
              <tr>
                <td
                  colSpan={6 + (isOwner ? 1 : 0) + (canViewProfit ? 1 : 0)}
                  className="p-4 text-center text-gray-500 text-xs sm:text-sm"
                >
                  No sales recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Returns list */}
      {returns.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6 mt-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Returns</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-max text-xs sm:text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 sm:p-3">Invoice #</th>
                  <th className="p-2 sm:p-3">
                    <span className="block">Items</span>
                    <span className="mt-0.5 flex text-[10px] uppercase font-medium text-gray-400">
                      <span className="flex-1 text-center">Name</span>
                      <span className="w-10 text-center">Qty</span>
                    </span>
                  </th>
                  <th className="p-2 sm:p-3">Refund</th>
                  <th className="p-2 sm:p-3">Reason</th>
                  <th className="p-2 sm:p-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {returns.map((r: any) => (
                  <tr key={r.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 sm:p-3 font-mono">
                      {r.sale?.invoiceNumber}
                    </td>
                    <td className="p-2 sm:p-3">
                      <table className="w-full">
                        <tbody>
                          {r.items.map((i: any, idx: number) => (
                            <tr key={idx} className={idx > 0 ? "border-t border-gray-200" : ""}>
                              <td className="py-1 pr-3 whitespace-nowrap">{i.product.baseName}</td>
                              <td className="py-1 w-10 whitespace-nowrap text-gray-500">{i.quantity}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                    <td className="p-2 sm:p-3 font-semibold text-red-600">
                      ${r.totalRefund.toFixed(2)}
                    </td>
                    <td className="p-2 sm:p-3 text-gray-500">
                      {r.reason || "—"}
                    </td>
                    <td className="p-2 sm:p-3 text-gray-500">
                      {r.createdAt?.slice(0, 10)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {/* Payment methods summary (Payments tab) */}
      {tab === "payments" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left min-w-[400px] text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">Payment Method</th>
                <th className="p-2 sm:p-3 md:p-4 text-right">Amount Collected</th>
              </tr>
            </thead>
            <tbody>
              {paymentBreakdown.map((pm) => (
                <tr key={pm.method} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 font-medium">{pm.method}</td>
                  <td className="p-2 sm:p-3 md:p-4 text-right font-semibold">
                    ${pm.total.toFixed(2)}
                  </td>
                </tr>
              ))}
              {paymentBreakdown.length === 0 && (
                <tr>
                  <td colSpan={2} className="p-6 text-center text-gray-400 text-sm">
                    No payments recorded for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Return Modal */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title={`Return Items — Sale #${returningSale?.invoiceNumber || ""}`}
      >
        <form onSubmit={handleReturn} className="grid grid-cols-1 gap-4">
          {returningSale?.items.map((i: any) => (
            <div key={i.productId} className="flex items-center gap-2">
              <span className="flex-1 text-sm text-gray-700">
                {i.product.brand} {i.product.baseName}
                <span className="text-gray-400"> (sold {i.quantity})</span>
              </span>
              <input
                type="number"
                min="0"
                max={i.quantity}
                value={
                  returnItems.find((r) => r.productId === i.productId)
                    ?.quantity ?? 0
                }
                onChange={(e) =>
                  setReturnItems(
                    returnItems.map((r) =>
                      r.productId === i.productId
                        ? { ...r, quantity: Number(e.target.value) }
                        : r,
                    ),
                  )
                }
                className="border p-2 rounded-lg w-24 text-sm"
              />
            </div>
          ))}
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Reason (optional)
            </label>
            <input
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              className="border p-2 rounded-lg w-full"
              placeholder="e.g. damaged, wrong item"
            />
          </div>
          <button
            type="submit"
            className="bg-red-600 text-white p-2 rounded-lg mt-2 font-medium"
          >
            Process Return
          </button>
        </form>
      </Modal>

      {/* Sale Details Modal */}
      <Modal
        isOpen={!!viewingSale}
        onClose={() => setViewingSale(null)}
        title={`Sale #${viewingSale?.invoiceNumber || ""}`}
      >
        {viewingSale && (
          <div className="text-sm space-y-3">
            <div className="grid grid-cols-2 gap-2 text-gray-700">
              <div>
                <span className="text-gray-400">Date:</span>{" "}
                {viewingSale.saleDate?.slice(0, 10) || "—"}
              </div>
              <div>
                <span className="text-gray-400">Shop:</span>{" "}
                {viewingSale.shop?.name || "—"}
              </div>
              <div>
                <span className="text-gray-400">Sold by:</span>{" "}
                {viewingSale.soldBy?.name || "—"}
              </div>
              <div>
                <span className="text-gray-400">Status:</span>{" "}
                {viewingSale.saleType === "FULLY_PAID"
                  ? "Paid"
                  : viewingSale.saleType === "PARTIALLY_PAID"
                    ? "Partial"
                    : "Credit"}
              </div>
              <div>
                <span className="text-gray-400">Payment:</span>{" "}
                {viewingSale.paymentMethod?.name || "—"}
              </div>
              {viewingSale.customer && (
                <div className="col-span-2">
                  <span className="text-gray-400">Customer:</span>{" "}
                  {viewingSale.customer.name}
                </div>
              )}
            </div>

            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">Item</th>
                    <th className="p-2 text-right">Qty</th>
                    <th className="p-2 text-right">Unit</th>
                    <th className="p-2 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {viewingSale.items.length === 0 && viewingSale.purchase ? (
                    <tr>
                      <td className="p-2">{viewingSale.purchase.productName}</td>
                      <td className="p-2 text-right">{viewingSale.purchase.quantity}</td>
                      <td className="p-2 text-right">
                        {viewingSale.purchase.sellPrice.toFixed(2)}
                      </td>
                      <td className="p-2 text-right">
                        {viewingSale.totalAmount.toFixed(2)}
                      </td>
                    </tr>
                  ) : (
                    viewingSale.items.map((i: any, idx: number) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          {i.product?.brand} {i.product?.baseName}
                        </td>
                        <td className="p-2 text-right">{i.quantity}</td>
                        <td className="p-2 text-right">{i.unitSellPrice.toFixed(2)}</td>
                        <td className="p-2 text-right">
                          {(i.unitSellPrice * i.quantity).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-gray-400">Total:</span>{" "}
                <strong>{viewingSale.totalAmount.toFixed(2)} birr</strong>
              </div>
              <div>
                <span className="text-gray-400">Paid / Remaining:</span>{" "}
                {viewingSale.paidAmount.toFixed(2)} /{" "}
                {viewingSale.remainingAmount.toFixed(2)}
              </div>
              {canViewProfit && (
                <>
                  <div>
                    <span className="text-gray-400">Cost:</span>{" "}
                    {viewingSale.totalCost.toFixed(2)} birr
                  </div>
                  <div>
                    <span className="text-gray-400">Profit:</span>{" "}
                    <strong
                      className={
                        viewingSale.profit >= 0 ? "text-green-600" : "text-red-500"
                      }
                    >
                      {viewingSale.profit.toFixed(2)} birr
                    </strong>
                  </div>
                </>
              )}
            </div>
            {viewingSale.notes && (
              <div>
                <span className="text-gray-400">Notes:</span> {viewingSale.notes}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
