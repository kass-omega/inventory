"use client";
import BarcodeScanner from "@/app/components/BarcodeScanner";
import Modal from "@/app/components/Modal";
import ProductForm from "@/app/components/ProductForm";
import SearchableSelect from "@/app/components/SearchableSelect";
import { useToast } from "@/app/components/ToastProvider";
import Loading from "@/app/components/Loading";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useEffect, useState } from "react";

export default function RestockPage() {
  const { user } = useAuth();
  const toast = useToast();
  const isOwner = user?.isSuperuser === true;
  const myStoreId =
    user?.locationType === "STORE" ? String(user.locationId ?? "") : "";

  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Product filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [form, setForm] = useState({
    productId: "",
    storeId: "",
    quantity: 1,
    newBuyPrice: 0,
    newSellPrice: 0,
  });
  const [showProductModal, setShowProductModal] = useState(false);

  const fetchProducts = async () => {
    setLoading(true);
    try {
      const res = await api.get(
        `/products?search=${search}&categoryId=${categoryFilter}`,
      );
      setProducts(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    api
      .get("/locations")
      .then((res) =>
        setStores(res.data.filter((l: any) => l.type === "STORE")),
      );
    api.get("/categories").then((res) => setCategories(res.data));
  }, [search, categoryFilter]);

  const myStore = stores.find((s: any) => s.id === Number(myStoreId));

  const handleProductChange = (id: string) => {
    const p = products.find((p: any) => p.id === Number(id));
    if (p)
      setForm({
        ...form,
        productId: id,
        newBuyPrice: p.currentBuyPrice,
        newSellPrice: p.currentSellPrice,
      });
  };

  const handleRestockScan = (sku: string) => {
    const product = products.find(
      (p: any) => p.sku.toLowerCase() === sku.toLowerCase(),
    );
    if (!product) {
      toast.error(`No product found for "${sku}"`);
      return;
    }
    handleProductChange(String(product.id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Non-owner users restock their own store (backend enforces this too).
      const storeId = isOwner ? Number(form.storeId) : Number(myStoreId);
      const payload: any = {
        productId: Number(form.productId),
        storeId,
        quantity: form.quantity,
      };
      // Only the owner can change prices on a restock.
      if (isOwner) {
        payload.newBuyPrice = form.newBuyPrice;
        payload.newSellPrice = form.newSellPrice;
      }
      await api.post("/restock", payload);
      toast.success(
        isOwner
          ? "Restock submitted — pending storekeeper confirmation."
          : "Restock submitted — awaiting owner approval.",
      );
      setForm({
        productId: "",
        storeId: "",
        quantity: 1,
        newBuyPrice: 0,
        newSellPrice: 0,
      });
    } catch (err) {
      markHandled(err);
      toast.error("Error restocking.");
    }
  };

  const handleProductCreated = (newProduct: any) => {
    fetchProducts();
    handleProductChange(String(newProduct.id));
    setShowProductModal(false);
  };

  if (loading) return <Loading className="py-24" />;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        Restock / Purchasing
      </h1>

      {!isOwner && (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3 mb-4">
          Restocking for your store ({myStore?.name ?? "your store"}). The owner
          must approve the request first — you'll confirm receipt once the stock
          is stored.
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border grid grid-cols-1 gap-3 sm:gap-4 lg:max-w-3xl"
      >
        {/* Category Filter */}
        <div className="mb-2 pb-4 border-b">
          <label className="block text-sm font-medium text-gray-500 mb-1">
            Filter by Category
          </label>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border p-2 rounded-lg w-full bg-white"
          >
            <option value="">All Categories</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-1">
            Select Product
          </label>
          <div className="flex gap-2">
            <SearchableSelect
              options={products.map((p: any) => ({
                value: String(p.id),
                label: `${p.brand} ${p.baseName} (${p.category?.name || "N/A"})`,
                searchText: `${p.brand} ${p.baseName} ${p.sku}`,
              }))}
              value={form.productId}
              onChange={handleProductChange}
              placeholder="Search product..."
              required
              className="flex-1"
            />
            <BarcodeScanner onScan={handleRestockScan} />
            <button
              type="button"
              onClick={() => setShowProductModal(true)}
              className="bg-gray-200 px-3 sm:px-4 rounded-lg text-xs sm:text-sm whitespace-nowrap"
            >
              + New
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">
            Store Location
          </label>
          {isOwner ? (
            <SearchableSelect
              options={stores.map((s: any) => ({
                value: String(s.id),
                label: s.name,
              }))}
              value={form.storeId}
              onChange={(v) => setForm({ ...form, storeId: v })}
              placeholder="Search store..."
              required
            />
          ) : (
            <div className="border border-gray-200 bg-gray-50 p-2 rounded-lg text-sm text-gray-700">
              {myStore?.name ?? "Your store"}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={form.quantity}
              onChange={(e) =>
                setForm({ ...form, quantity: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          {isOwner && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  New Buy Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.newBuyPrice}
                  onChange={(e) =>
                    setForm({ ...form, newBuyPrice: Number(e.target.value) })
                  }
                  className="border p-2 rounded-lg w-full"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  New Sell Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={form.newSellPrice}
                  onChange={(e) =>
                    setForm({ ...form, newSellPrice: Number(e.target.value) })
                  }
                  className="border p-2 rounded-lg w-full"
                  required
                />
              </div>
            </>
          )}
        </div>

        <button
          type="submit"
          className="bg-green-600 text-white p-2 rounded-lg hover:bg-green-700 mt-2 font-medium"
        >
          Save Restock
        </button>
      </form>

      {/* Product Form Modal */}
      <Modal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        title="Add New Product"
      >
        <ProductForm
          onProductCreated={handleProductCreated}
          onCancel={() => setShowProductModal(false)}
        />
      </Modal>
    </div>
  );
}
