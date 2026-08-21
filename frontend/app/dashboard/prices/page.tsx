"use client";
import api from "@/lib/api";
import Loading from "@/app/components/Loading";
import { useConfirm } from "@/app/components/ConfirmProvider";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useEffect, useState } from "react";

export default function PriceHistoryPage() {
  const confirm = useConfirm();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ newBuyPrice: 0, newSellPrice: 0 });

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get("/price-history");
      setHistory(res.data);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchHistory();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      await api.put(`/price-history/${editing.id}`, form);
    }
    setShowForm(false);
    setEditing(null);
    fetchHistory();
  };

  const startEdit = (h: any) => {
    setEditing(h);
    setShowForm(true);
    setForm({ newBuyPrice: h.newBuyPrice, newSellPrice: h.newSellPrice });
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm("Delete this price record?");
    if (!ok) return;
    await api.delete(`/price-history/${id}`);
    fetchHistory();
  };

  if (loading) return <Loading className="py-24" />;

  return (
    <div>
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        Price History
      </h1>

      {showForm && editing && (
        <form
          onSubmit={handleSave}
          className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border mb-6 grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 items-end"
        >
          <div className="sm:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-1">
              New Buy Price
            </label>
            <input
              type="number"
              value={form.newBuyPrice}
              onChange={(e) =>
                setForm({ ...form, newBuyPrice: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full text-sm"
              required
            />
          </div>
          <div className="sm:col-span-1">
            <label className="block text-xs sm:text-sm font-medium text-gray-500 mb-1">
              New Sell Price
            </label>
            <input
              type="number"
              value={form.newSellPrice}
              onChange={(e) =>
                setForm({ ...form, newSellPrice: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full text-sm"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg text-sm"
          >
            Update Record
          </button>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left min-w-[550px] sm:min-w-[600px] text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">Date</th>
              <th className="p-2 sm:p-3 md:p-4">Product</th>
              <th className="p-2 sm:p-3 md:p-4">Old Buy</th>
              <th className="p-2 sm:p-3 md:p-4">New Buy</th>
              <th className="p-2 sm:p-3 md:p-4">Old Sell</th>
              <th className="p-2 sm:p-3 md:p-4">New Sell</th>
              <th className="p-2 sm:p-3 md:p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h: any) => (
              <tr key={h.id} className="border-b">
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-500">
                  {new Date(h.updatedAt).toLocaleDateString()}
                </td>
                <td className="p-2 sm:p-3 md:p-4 font-medium">
                  {h.product.brand} {h.product.baseName}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-red-500">${h.oldBuyPrice}</td>
                <td className="p-2 sm:p-3 md:p-4 text-green-600 font-semibold">
                  ${h.newBuyPrice}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-red-500">${h.oldSellPrice}</td>
                <td className="p-2 sm:p-3 md:p-4 text-green-600 font-semibold">
                  ${h.newSellPrice}
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  <RowActionsMenu
                    items={[
                      { label: "Edit", onClick: () => startEdit(h) },
                      {
                        label: "Delete",
                        color: "text-red-500",
                        onClick: () => handleDelete(h.id),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
