"use client";
import BarcodeScanner from "./BarcodeScanner";
import api from "@/lib/api";
import { useEffect, useState } from "react";

interface Props {
  customerId: number;
  customerName: string;
  onCreated: () => void;
  onCancel: () => void;
}

export default function CreditSaleForm({ customerId, customerName, onCreated, onCancel }: Props) {
  const [products, setProducts] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [saleType, setSaleType] = useState<"PARTIALLY_PAID" | "CREDITED">("CREDITED");
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [newMethodName, setNewMethodName] = useState("");
  const [loading, setLoading] = useState(false);
  const [cart, setCart] = useState([{ productId: "", quantity: 1, customPrice: "" }]);

  useEffect(() => {
    api.get("/products").then((r) => setProducts(r.data));
    api.get("/payment-methods").then((r) => setPaymentMethods(r.data));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    if (saleType === "PARTIALLY_PAID" && !paymentMethodId) {
      setErrorMsg("Payment method is required.");
      return;
    }
    if (saleType === "PARTIALLY_PAID" && (!paidAmount || Number(paidAmount) <= 0)) {
      setErrorMsg("Paid amount must be greater than 0.");
      return;
    }
    const items = cart
      .map((c) => ({
        productId: Number(c.productId),
        quantity: Number(c.quantity),
        customPrice: c.customPrice ? Number(c.customPrice) : undefined,
      }))
      .filter((c) => c.productId);
    if (items.length === 0) { setErrorMsg("Add at least one item."); return; }
    setLoading(true);
    try {
      await api.post("/sales", {
        items, saleType,
        paidAmount: saleType === "PARTIALLY_PAID" ? Number(paidAmount) : undefined,
        paymentMethodId: paymentMethodId ? Number(paymentMethodId) : undefined,
        customerId,
      });
      onCreated();
    } catch { setErrorMsg("Error processing sale."); }
    finally { setLoading(false); }
  }

  const handleScanAt = (index: number, sku: string) => {
    const product = products.find(
      (p) => p.sku.toLowerCase() === sku.toLowerCase(),
    );
    if (!product) {
      setErrorMsg(`No product found for "${sku}"`);
      return;
    }
    if (cart.some((c) => c.productId === String(product.id))) {
      setErrorMsg(`${product.brand} ${product.baseName} is already in the sale`);
      return;
    }
    setCart((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, productId: String(product.id) } : item,
      ),
    );
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <span className="text-gray-500">Customer: </span>
        <span className="font-medium">{customerName}</span>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1">Payment Type</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSaleType("CREDITED")}
            className={saleType === "CREDITED" ? "flex-1 py-2 rounded-lg text-sm font-medium border bg-red-500 text-white border-red-500" : "flex-1 py-2 rounded-lg text-sm font-medium border bg-white text-gray-600 border-gray-300"}>
            Full Credit
          </button>
          <button type="button" onClick={() => setSaleType("PARTIALLY_PAID")}
            className={saleType === "PARTIALLY_PAID" ? "flex-1 py-2 rounded-lg text-sm font-medium border bg-amber-500 text-white border-amber-500" : "flex-1 py-2 rounded-lg text-sm font-medium border bg-white text-gray-600 border-gray-300"}>
            Partial
          </button>
        </div>
      </div>
      {cart.map((item, idx) => (
        <div key={idx} className="border p-3 rounded-lg flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-500 mb-1">Product</label>
            <div className="flex gap-2">
              <select value={item.productId} onChange={(e) => { const nc = [...cart]; nc[idx].productId = e.target.value; setCart(nc); }}
                className="border p-2 rounded-lg w-full bg-white text-sm" required>
                <option value="">Select</option>
                {products.map((p) => (<option key={p.id} value={p.id}>{p.brand} {p.baseName}</option>))}
              </select>
              <BarcodeScanner onScan={(sku) => handleScanAt(idx, sku)} />
            </div>
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
            <input type="number" min="1" value={item.quantity} onChange={(e) => { const nc = [...cart]; nc[idx].quantity = Number(e.target.value); setCart(nc); }}
              className="border p-2 rounded-lg w-full text-sm" required />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-gray-500 mb-1">Price</label>
            <input type="number" step="0.01" placeholder="Default" value={item.customPrice}
              onChange={(e) => { const nc = [...cart]; nc[idx].customPrice = e.target.value; setCart(nc); }}
              className="border p-2 rounded-lg w-full text-sm" />
          </div>
          {cart.length > 1 && (
            <button type="button" onClick={() => setCart(cart.filter((_, i) => i !== idx))}
              className="bg-red-100 text-red-600 px-2 py-2 rounded-lg text-sm">X</button>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <button type="button" onClick={() => setCart([...cart, { productId: "", quantity: 1, customPrice: "" }])}
          className="flex-1 bg-gray-100 text-gray-700 p-2 rounded-lg text-sm border border-dashed">
          + Add Item
        </button>
      </div>
      {saleType === "PARTIALLY_PAID" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Paid Amount (birr)</label>
            <input type="number" step="0.01" min="1" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Payment Method</label>
            <div className="flex gap-2">
              <select value={paymentMethodId} onChange={(e) => setPaymentMethodId(e.target.value)}
                className="border p-2 rounded-lg flex-1 bg-white text-sm">
                <option value="">Select</option>
                {paymentMethods.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
              </select>
              <input placeholder="New" value={newMethodName} onChange={(e) => setNewMethodName(e.target.value)}
                className="border p-2 rounded-lg w-24 text-sm" />
              <button type="button" onClick={async () => {
                if (!newMethodName.trim()) return;
                const r = await api.post("/payment-methods", { name: newMethodName.trim() });
                setPaymentMethods([...paymentMethods, r.data]);
                setPaymentMethodId(String(r.data.id));
                setNewMethodName("");
              }} className="bg-gray-200 px-2 rounded-lg text-xs">+</button>
            </div>
          </div>
        </>
      )}
      {errorMsg && <div className="text-red-600 text-sm bg-red-50 p-2 rounded-lg">{errorMsg}</div>}
      <div className="flex gap-2 mt-2">
        <button type="submit" disabled={loading}
          className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {loading ? "Processing..." : "Record Sale"}
        </button>
        <button type="button" onClick={onCancel}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300">
          Cancel
        </button>
      </div>
    </form>
  );
}