"use client";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useEffect, useState } from "react";
import { useToast } from "@/app/components/ToastProvider";

interface ProductFormProps {
  onProductCreated: (product: any) => void;
  onCancel: () => void;
}

export default function ProductForm({ onProductCreated, onCancel }: ProductFormProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [categories, setCategories] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [showCatForm, setShowCatForm] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [newUnit, setNewUnit] = useState("");
  const [form, setForm] = useState<any>({
    brand: "", baseName: "", currentBuyPrice: 0, currentSellPrice: 0,
    categoryId: "", unitId: "", storeId: "", quantity: 1,
  });
  const [attrs, setAttrs] = useState([{ key: "", value: "" }]);

  useEffect(() => {
    api.get("/categories").then((res) => setCategories(res.data));
    api.get("/units").then((res) => setUnits(res.data));
    api.get("/locations").then((res) =>
      setStores(res.data.filter((l: any) => l.type === "STORE")));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const attributes = attrs.reduce((acc, { key, value }) => (key ? { ...acc, [key]: value } : acc), {});
    try {
      const res = await api.post("/products", {
        brand: form.brand, baseName: form.baseName, attributes,
        currentBuyPrice: Number(form.currentBuyPrice),
        currentSellPrice: Number(form.currentSellPrice),
        categoryId: Number(form.categoryId),
        unitId: form.unitId ? Number(form.unitId) : undefined,
        storeId: form.storeId ? Number(form.storeId) : undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
      });
      onProductCreated(res.data);
    } catch (err: any) { markHandled(err); toast.error("Error creating product."); }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCat) return;
    const res = await api.post("/categories", { name: newCat });
    setCategories([...categories, res.data]);
    setNewCat(""); setShowCatForm(false);
    setForm({ ...form, categoryId: res.data.id });
  };

  const handleAddUnit = async () => {
    if (!newUnit.trim()) return;
    const res = await api.post("/units", { name: newUnit.trim() });
    setUnits([...units, res.data]);
    setForm({ ...form, unitId: res.data.id });
    setNewUnit("");
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Brand</label>
        <input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })}
          className="border p-2 rounded-lg w-full text-sm" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Base Name</label>
        <input value={form.baseName} onChange={(e) => setForm({ ...form, baseName: e.target.value })}
          className="border p-2 rounded-lg w-full text-sm" required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-500 mb-1">Category</label>
        <div className="flex gap-2">
          <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            className="border p-2 rounded-lg w-full bg-white text-sm" required>
            <option value="">Select Category...</option>
            {categories.map((c: any) => (<option key={c.id} value={c.id}>{c.name}</option>))}
          </select>
          <button type="button" onClick={() => setShowCatForm(!showCatForm)}
            className="bg-gray-200 px-3 rounded-lg text-sm whitespace-nowrap">+ Cat</button>
        </div>
        {showCatForm && (
          <div className="flex gap-2 mt-2">
            <input placeholder="New category name" value={newCat} onChange={(e) => setNewCat(e.target.value)}
              className="border p-2 rounded-lg flex-1 text-sm" />
            <button type="button" onClick={handleAddCategory} className="bg-green-600 text-white px-3 rounded-lg text-sm">Add</button>
          </div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Measuring Unit</label>
        <div className="flex gap-2">
          <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })}
            className="border p-2 rounded-lg flex-1 bg-white text-sm">
            <option value="">Select...</option>
            {units.map((u: any) => (<option key={u.id} value={u.id}>{u.name}</option>))}
          </select>
          <input placeholder="New" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}
            className="border p-2 rounded-lg w-24 text-sm" />
          <button type="button" onClick={handleAddUnit} className="bg-gray-200 px-2 rounded-lg text-xs">+</button>
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Store (add to inventory)</label>
        <select value={form.storeId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}
          className="border p-2 rounded-lg w-full bg-white text-sm">
          <option value="">No inventory</option>
          {stores.map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Buy Price</label>
        <input type="number" value={form.currentBuyPrice}
          onChange={(e) => setForm({ ...form, currentBuyPrice: Number(e.target.value) })}
          className="border p-2 rounded-lg w-full text-sm" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Sell Price</label>
        <input type="number" value={form.currentSellPrice}
          onChange={(e) => setForm({ ...form, currentSellPrice: Number(e.target.value) })}
          className="border p-2 rounded-lg w-full text-sm" required />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-500 mb-1">Initial Quantity</label>
        <input type="number" min="1" value={form.quantity}
          onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
          className="border p-2 rounded-lg w-full text-sm" />
      </div>
      <div className="md:col-span-2 border-t pt-4 mt-2">
        <h3 className="font-semibold mb-2 text-sm">Specifications</h3>
        {attrs.map((attr, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input placeholder="Key (e.g. Watt)" value={attr.key}
              onChange={(e) => setAttrs(attrs.map((a, idx) => idx === i ? { ...a, key: e.target.value } : a))}
              className="border p-2 rounded-lg flex-1 text-sm" />
            <input placeholder="Value (e.g. 12W)" value={attr.value}
              onChange={(e) => setAttrs(attrs.map((a, idx) => idx === i ? { ...a, value: e.target.value } : a))}
              className="border p-2 rounded-lg flex-1 text-sm" />
            <button type="button" onClick={() => setAttrs(attrs.filter((_, idx) => idx !== i))}
              className="text-red-500 px-2">X</button>
          </div>
        ))}
        <button type="button" onClick={() => setAttrs([...attrs, { key: "", value: "" }])}
          className="text-sm text-blue-600">+ Add Specification</button>
      </div>
      <div className="md:col-span-2 flex gap-2 mt-2">
        <button type="submit" className="bg-green-600 text-white p-2 rounded-lg flex-1 text-sm">Save Product</button>
        <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-700 p-2 rounded-lg flex-1 text-sm">Cancel</button>
      </div>
    </form>
  );
}