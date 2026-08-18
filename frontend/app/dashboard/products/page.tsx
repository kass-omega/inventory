"use client";
import Modal from "@/app/components/Modal";
import ProductForm from "@/app/components/ProductForm";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";
import CategoriesManager from "@/app/components/CategoriesManager";
import ProductDetailModal from "@/app/components/ProductDetailModal";
import { useEffect, useState } from "react";

export default function ProductsPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState<any[]>([]);
  const [newUnit, setNewUnit] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [adjustForm, setAdjustForm] = useState({
    locationId: "",
    quantity: 0,
    reason: "",
  });
  const [locations, setLocations] = useState<any[]>([]);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrProduct, setQrProduct] = useState<any>(null);
  const [tab, setTab] = useState<"products" | "categories">("products");
  const [detailProduct, setDetailProduct] = useState<any>(null);

  const [form, setForm] = useState<any>({
    brand: "",
    baseName: "",
    currentBuyPrice: 0,
    currentSellPrice: 0,
    categoryId: "",
    unitId: "",
  });
  const [attrs, setAttrs] = useState([{ key: "", value: "" }]);

  const fetchProducts = async () => {
    const res = await api.get(
      `/products?search=${search}&categoryId=${categoryFilter}`,
    );
    setProducts(res.data);
  };

  const fetchCategories = async () => {
    const res = await api.get("/categories");
    setCategories(res.data);
  };

  const fetchUnits = async () => {
    const res = await api.get("/units");
    setUnits(res.data);
  };

  const handleAddUnit = async () => {
    if (!newUnit.trim()) return;
    const res = await api.post("/units", { name: newUnit.trim() });
    setUnits([...units, res.data]);
    setForm({ ...form, unitId: res.data.id });
    setNewUnit("");
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
    fetchUnits();
  }, [search, categoryFilter]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const attributes = attrs.reduce(
      (acc, { key, value }) => (key ? { ...acc, [key]: value } : acc),
      {},
    );
    const payload = {
      ...form,
      attributes,
      categoryId: Number(form.categoryId),
      unitId: form.unitId ? Number(form.unitId) : null,
    };

    if (editing) await api.put(`/products/${editing.id}`, payload);

    setShowEditModal(false);
    setEditing(null);
    setAttrs([{ key: "", value: "" }]);
    fetchProducts();
  };

  const startEdit = (p: any) => {
    setEditing(p);
    setShowEditModal(true);
    setForm({
      brand: p.brand,
      baseName: p.baseName,
      currentBuyPrice: p.currentBuyPrice,
      currentSellPrice: p.currentSellPrice,
      categoryId: p.categoryId,
      unitId: p.unitId || "",
    });
    setAttrs(
      Object.entries(p.attributes).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    );
  };

  const canCreate = hasPermission("products.create");
  const canEdit = hasPermission("products.edit");
  const canDelete = hasPermission("products.delete");
  const canAdjust = hasPermission("products.adjust-stock");

  /**
   * Calculate total stock for a product from its inventory array.
   */
  const getTotalStock = (product: any): number => {
    if (!product.inventory || product.inventory.length === 0) return 0;
    return product.inventory.reduce(
      (sum: number, inv: any) => sum + inv.quantity,
      0,
    );
  };

  useEffect(() => {
    if (!canAdjust) return;
    api.get("/locations").then((res) => {
      const locs = res.data;
      if (user?.locationType === "STORE") {
        setLocations(locs.filter((l: any) => l.id === user.locationId));
      } else {
        setLocations(locs);
      }
    });
  }, [canAdjust, user]);

  const startAdjust = (p: any) => {
    setAdjusting(p);
    setAdjustForm({
      locationId: locations.length === 1 ? String(locations[0].id) : "",
      quantity: getTotalStock(p),
      reason: "",
    });
    setShowAdjustModal(true);
  };

  const handleAdjust = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjusting || !adjustForm.locationId) {
      toast.error("Please select a location.");
      return;
    }
    try {
      await api.post(`/products/${adjusting.id}/adjust-stock`, {
        locationId: Number(adjustForm.locationId),
        quantity: Number(adjustForm.quantity),
        reason: adjustForm.reason || undefined,
      });
      toast.success("Stock adjusted.");
      setShowAdjustModal(false);
      setAdjusting(null);
      fetchProducts();
    } catch {
      toast.error("Failed to adjust stock.");
    }
  };

  const handleDelete = async (p: any) => {
    const ok = await confirm(`Delete "${p.brand} ${p.baseName}"?`);
    if (!ok) return;
    try {
      await api.delete(`/products/${p.id}`);
      toast.success("Product deleted");
      fetchProducts();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Failed to delete product");
    }
  };

  const startQr = (p: any) => {
    setQrProduct(p);
    setShowQrModal(true);
  };

  return (
    <div>
      <div className="flex justify-between items-start md:items-center mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Products
        </h1>
        {tab === "products" && canCreate && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg whitespace-nowrap text-sm"
          >
            + Add
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-6">
        <button type="button" onClick={() => setTab("products")}
          className={"px-4 py-2 rounded text-sm " + (tab === "products" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600")}>
          Products
        </button>
        <button type="button" onClick={() => setTab("categories")}
          className={"px-4 py-2 rounded text-sm " + (tab === "categories" ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600")}>
          Categories
        </button>
      </div>

      {tab === "categories" ? (
        <CategoriesManager />
      ) : (
      <>
      <div className="flex w-full items-start md:items-center mb-6 gap-3">
        <input
          placeholder="Search name/brand/SKU..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded-lg flex-1 text-sm"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="border p-2 rounded-lg bg-white text-sm"
        >
          <option value="">All Categories</option>
          {categories.map((c: any) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px] sm:min-w-[700px] text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">SKU</th>
                <th className="p-2 sm:p-3 md:p-4">Name</th>
                <th className="p-2 sm:p-3 md:p-4">Category</th>
                <th className="p-2 sm:p-3 md:p-4">Stock</th>
                <th className="p-2 sm:p-3 md:p-4">QR</th>
                {(canEdit || canDelete || canAdjust) && <th className="p-2 sm:p-3 md:p-4">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {products.map((p: any) => {
                const stock = getTotalStock(p);
                return (
                  <tr key={p.id} onClick={() => setDetailProduct(p)} className="border-b hover:bg-gray-50 cursor-pointer">
                    <td className="p-2 sm:p-3 md:p-4 font-mono text-xs sm:text-sm">
                      {p.sku}
                    </td>
                    <td className="p-2 sm:p-3 md:p-4 font-medium">
                      {p.brand} {p.baseName}
                    </td>
                    <td className="p-2 sm:p-3 md:p-4">
                      <span className="bg-gray-100 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs">
                        {p.category?.name || "N/A"}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 md:p-4">
                      <span
                        className={`font-bold text-xs sm:text-sm ${stock < 10 ? "text-red-500" : "text-gray-800"}`}
                      >
                        {stock}
                      </span>
                    </td>
                    <td className="p-2 sm:p-3 md:p-4">
                      <button
                        onClick={(e) => { e.stopPropagation(); startQr(p); }}
                        className="text-gray-600 text-xs sm:text-sm cursor-pointer"
                      >
                        QR
                      </button>
                    </td>
                    {(canEdit || canDelete || canAdjust) && (
                      <td className="p-2 sm:p-3 md:p-4">
                        <RowActionsMenu
                          items={[
                            {
                              label: "View Details",
                              onClick: () => setDetailProduct(p),
                            },
                            ...(canEdit
                              ? [{ label: "Edit", onClick: () => startEdit(p) }]
                              : []),
                            ...(canAdjust
                              ? [
                                  {
                                    label: "Adjust",
                                    color: "text-green-600",
                                    onClick: () => startAdjust(p),
                                  },
                                ]
                              : []),
                            ...(canDelete
                              ? [
                                  {
                                    label: "Delete",
                                    color: "text-red-500",
                                    onClick: () => handleDelete(p),
                                  },
                                ]
                              : []),
                          ]}
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* Add Product Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Product"
      >
        <ProductForm
          onProductCreated={() => {
            setShowAddModal(false);
            fetchProducts();
            fetchCategories();
          }}
          onCancel={() => setShowAddModal(false)}
        />
      </Modal>

      {/* Edit Product Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit: ${editing?.brand} ${editing?.baseName}`}
      >
        <form
          onSubmit={handleSaveEdit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Brand
            </label>
            <input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Base Name
            </label>
            <input
              value={form.baseName}
              onChange={(e) => setForm({ ...form, baseName: e.target.value })}
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Category
            </label>
            <select
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
              className="border p-2 rounded-lg w-full bg-white"
              required
            >
              <option value="">Select...</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Buy Price ($)
            </label>
            <input
              type="number"
              value={form.currentBuyPrice}
              onChange={(e) =>
                setForm({ ...form, currentBuyPrice: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Sell Price ($)
            </label>
            <input
              type="number"
              value={form.currentSellPrice}
              onChange={(e) =>
                setForm({ ...form, currentSellPrice: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1 flex-1">
              Measuring Unit
            </label>
            <div className="flex gap-2 flex-1">
              <select
                value={form.unitId}
                onChange={(e) => setForm({ ...form, unitId: e.target.value })}
                className="border p-2 rounded-lg flex-1 bg-white text-sm"
              >
                <option value="">Select...</option>
                {units.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1 flex-1">
              Add New Unit
            </label>
            <div className="flex gap-2 flex-1">
              <input
                placeholder="New"
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="border p-2 rounded-lg flex-1 text-sm"
              />
              <button
                type="button"
                onClick={handleAddUnit}
                className="bg-gray-200 px-2 rounded-lg text-xs cursor-pointer"
              >
                + Add Unit
              </button>
            </div>
          </div>

          <div className="md:col-span-2 border-t pt-4 mt-2">
            <h3 className="font-semibold mb-2">Specifications</h3>
            {attrs.map((attr, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <input
                  placeholder="Key"
                  value={attr.key}
                  onChange={(e) =>
                    setAttrs(
                      attrs.map((a, idx) =>
                        idx === i ? { ...a, key: e.target.value } : a,
                      ),
                    )
                  }
                  className="border p-2 rounded-lg flex-1"
                />
                <input
                  placeholder="Value"
                  value={attr.value}
                  onChange={(e) =>
                    setAttrs(
                      attrs.map((a, idx) =>
                        idx === i ? { ...a, value: e.target.value } : a,
                      ),
                    )
                  }
                  className="border p-2 rounded-lg flex-1"
                />
                <button
                  type="button"
                  onClick={() => setAttrs(attrs.filter((_, idx) => idx !== i))}
                  className="text-red-500 px-2 cursor-pointer"
                >
                  X
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setAttrs([...attrs, { key: "", value: "" }])}
              className="text-sm text-blue-600 cursor-pointer"
            >
              + Add Specification
            </button>
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg md:col-span-2 mt-4 cursor-pointer"
          >
            Update Product
          </button>
        </form>
      </Modal>

      {/* Adjust Stock Modal */}
      <Modal
        isOpen={showAdjustModal}
        onClose={() => setShowAdjustModal(false)}
        title={`Adjust Stock: ${adjusting?.brand} ${adjusting?.baseName}`}
      >
        <form onSubmit={handleAdjust} className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Location
            </label>
            <select
              value={adjustForm.locationId}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, locationId: e.target.value })
              }
              className="border p-2 rounded-lg w-full bg-white"
              required
            >
              <option value="">Select Location</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              New Quantity (physical count)
            </label>
            <input
              type="number"
              min="0"
              value={adjustForm.quantity}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, quantity: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Reason (optional)
            </label>
            <input
              value={adjustForm.reason}
              onChange={(e) =>
                setAdjustForm({ ...adjustForm, reason: e.target.value })
              }
              className="border p-2 rounded-lg w-full"
              placeholder="e.g. physical count correction"
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg mt-2 font-medium"
          >
            Save Adjustment
          </button>
        </form>
      </Modal>

      {/* QR Code Modal */}
      <Modal
        isOpen={showQrModal}
        onClose={() => setShowQrModal(false)}
        title="Product QR Code"
      >
        <div className="flex flex-col items-center gap-3 py-4">
          <QRCodeSVG value={qrProduct?.sku || ""} size={200} />
          <div className="text-center">
            <p className="font-mono text-sm font-semibold">{qrProduct?.sku}</p>
            <p className="text-gray-500 text-sm">
              {qrProduct?.brand} {qrProduct?.baseName}
            </p>
          </div>
        </div>
      </Modal>

      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
      />
    </div>
  );
}
