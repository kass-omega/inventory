"use client";
import CreditSaleForm from "@/app/components/CreditSaleForm";
import Modal from "@/app/components/Modal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

export default function CustomerDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const isOwner = user?.isSuperuser === true;
  const [customer, setCustomer] = useState<any>(null);
  const [locations, setLocations] = useState<any[]>([]);
  const [shopFilter, setShopFilter] = useState(
    isOwner ? "" : String(user?.locationId || ""),
  );
  const [productSearch, setProductSearch] = useState("");
  const [tab, setTab] = useState<"sales" | "payments">("sales");
  const [showPayModal, setShowPayModal] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [payMethodId, setPayMethodId] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  const [newMethodName, setNewMethodName] = useState("");
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [showEditPayModal, setShowEditPayModal] = useState(false);
  const [editPayAmount, setEditPayAmount] = useState("");
  const [editPayNotes, setEditPayNotes] = useState("");
  const [editPayMethodId, setEditPayMethodId] = useState("");
  const [editNewMethodName, setEditNewMethodName] = useState("");
  const [showSaleModal, setShowSaleModal] = useState(false);

  const fetchCustomer = async () => {
    const params = new URLSearchParams();
    if (shopFilter) params.set("shopId", shopFilter);
    const res = await api.get(`/customers/${id}?${params}`);
    setCustomer(res.data);
  };

  useEffect(() => {
    if (isOwner)
      api
        .get("/locations")
        .then((r) =>
          setLocations(r.data.filter((l: any) => l.type === "SHOP")),
        );
    fetchCustomer();
    api.get("/payment-methods").then((r) => setPaymentMethods(r.data));
  }, [id, shopFilter]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/credit-payments", {
        customerId: Number(id),
        amount: Number(payAmount),
        notes: payNotes || undefined,
        paymentMethodId: payMethodId ? Number(payMethodId) : undefined,
      });
      setShowPayModal(false);
      setPayAmount("");
      setPayNotes("");
      setPayMethodId("");

      fetchCustomer();
    } catch {
      toast.error("Failed to record payment");
    }
  };

  const handleDeleteSale = async (id: number) => {
    const ok = await confirm("Delete this credit sale?");
    if (!ok) return;
    try {
      await api.delete(`/credit-sales/${id}`);
      fetchCustomer();
    } catch {
      toast.error("Failed to delete credit sale");
    }
  };

  const handleDeletePayment = async (id: number) => {
    const ok = await confirm("Delete this payment?");
    if (!ok) return;
    try {
      await api.delete(`/credit-payments/${id}`);
      fetchCustomer();
    } catch {
      toast.error("Failed to delete payment");
    }
  };

  const startEditPayment = (cp: any) => {
    setEditingPayment(cp);
    setEditPayAmount(String(cp.amount));
    setEditPayNotes(cp.notes || "");
    setEditPayMethodId(cp.paymentMethodId ? String(cp.paymentMethodId) : "");
    setShowEditPayModal(true);
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.put(`/credit-payments/${editingPayment.id}`, {
        amount: Number(editPayAmount),
        notes: editPayNotes || undefined,
        paymentMethodId: editPayMethodId ? Number(editPayMethodId) : undefined,
      });
      setShowEditPayModal(false);
      setEditingPayment(null);
      setEditPayAmount("");
      setEditPayNotes("");
      setEditPayMethodId("");
      fetchCustomer();
    } catch {
      toast.error("Failed to update payment");
    }
  };

  // Filter credit sales by product search, then group by date
  const filteredSales = useMemo(() => {
    return (customer?.creditSales || []).filter((cs: any) => {
      if (!productSearch) return true;
      const term = productSearch.toLowerCase();
      return cs.items.some(
        (i: any) =>
          i.product?.brand?.toLowerCase().includes(term) ||
          i.product?.baseName?.toLowerCase().includes(term),
      );
    });
  }, [customer, productSearch]);

  const groupedSales = useMemo(() => {
    const groups: Record<string, any[]> = {};
    let running = 0;
    // Sort by createdAt desc
    [...filteredSales]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .forEach((cs) => {
        const date = new Date(cs.createdAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        if (!groups[date]) groups[date] = [];
        groups[date].push(cs);
      });
    // Build with accumulated
    const result: {
      date: string;
      sales: any[];
      dayTotal: number;
      accumulated: number;
    }[] = [];
    Object.entries(groups).forEach(([date, sales]) => {
      const dayTotal = sales.reduce((s, cs) => s + cs.totalAmount, 0);
      running += dayTotal;
      result.push({ date, sales, dayTotal, accumulated: running });
    });
    return result;
  }, [filteredSales]);

  if (!customer) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-start md:items-center mb-6 gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/credits"
            className="text-gray-400 hover:text-gray-600 text-lg"
          >
            ←
          </Link>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
            {customer.name}
          </h1>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowSaleModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
          >
            + Sale
          </button>
          <button
            onClick={() => setShowPayModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 whitespace-nowrap"
          >
            Record Payment
          </button>
        </div>
      </div>

      {/* Inline Payment Form */}

      <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-6">
        {[
          {
            label: "Total Credits",
            value: customer.totalCredits.toFixed(2) + " birr",
            color: "text-gray-800",
          },
          {
            label: "Total Paid",
            value: customer.totalPaid.toFixed(2) + " birr",
            color: "text-green-600",
          },
          {
            label: "Remaining",
            value: customer.remaining.toFixed(2) + " birr",
            color: customer.remaining > 0 ? "text-red-500" : "text-green-600",
          },
        ].map((k) => (
          <div
            key={k.label}
            className="bg-white rounded-xl shadow-sm border p-3 sm:p-4 text-center"
          >
            <p className="text-[10px] sm:text-xs font-semibold text-gray-400 uppercase tracking-wider">
              {k.label}
            </p>
            <p className={"text-sm sm:text-lg font-bold mt-1 " + k.color}>
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex gap-0.5 sm:gap-1 mb-4 border-b overflow-x-auto pb-px">
        {["sales", "payments"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t as any)}
            className={
              "px-3 sm:px-4 py-2 whitespace-nowrap text-xs sm:text-sm font-medium rounded-t-lg transition " +
              (tab === t
                ? "bg-white text-blue-600 border border-b-white -mb-px shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100")
            }
          >
            {t === "sales" ? "Credit Sales" : "Payment History"}
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        {isOwner && (
          <select
            value={shopFilter}
            onChange={(e) => setShopFilter(e.target.value)}
            className="border p-2 rounded-lg bg-white text-sm"
          >
            <option value="">All Shops</option>
            {locations.map((l: any) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        {tab === "sales" && (
          <input
            placeholder="Search product..."
            value={productSearch}
            onChange={(e) => setProductSearch(e.target.value)}
            className="border p-2 rounded-lg flex-1 text-sm"
          />
        )}
      </div>

      {tab === "sales" && (
        <div className="space-y-4">
          {groupedSales.map(({ date, sales, dayTotal, accumulated }) => (
            <div
              key={date}
              className="bg-white rounded-xl shadow-sm border overflow-hidden"
            >
              <div className="px-3 sm:px-4 py-2.5 bg-gray-50 border-b text-xs sm:text-sm font-semibold text-gray-700 flex justify-between">
                <span>
                  {date} · {sales.length} sale{sales.length > 1 ? "s" : ""} ·{" "}
                  {dayTotal.toFixed(2)} birr
                </span>
                <span className="text-gray-500 font-normal">
                  Acc: {accumulated.toFixed(2)} birr
                </span>
              </div>
              {sales.map((cs: any) => (
                <div key={cs.id} className="border-b last:border-b-0">
                  <div className="px-3 sm:px-4 py-1.5 text-[10px] sm:text-xs text-gray-400 bg-gray-50/50 flex justify-between items-center">
                    <span>
                      {cs.shop?.name || "Shop"} · {cs.items.length} item
                      {cs.items.length > 1 ? "s" : ""}
                    </span>
                    <RowActionsMenu
                      items={[
                        {
                          label: "Delete",
                          color: "text-red-500",
                          onClick: () => handleDeleteSale(cs.id),
                        },
                      ]}
                    />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs sm:text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="p-2 sm:p-3 font-medium text-gray-500">
                            Product
                          </th>
                          <th className="p-2 sm:p-3 text-center w-16 font-medium text-gray-500">
                            Qty
                          </th>
                          <th className="p-2 sm:p-3 text-right w-24 font-medium text-gray-500">
                            Price
                          </th>
                          <th className="p-2 sm:p-3 text-right w-24 font-medium text-gray-500">
                            Subtotal
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {cs.items.map((item: any, i: number) => (
                          <tr
                            key={`${cs.id}-${i}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="p-2 sm:p-3">
                              {item.product?.brand} {item.product?.baseName}
                            </td>
                            <td className="p-2 sm:p-3 text-center">
                              {item.quantity}
                            </td>
                            <td className="p-2 sm:p-3 text-right">
                              {item.unitPrice.toFixed(2)}
                            </td>
                            <td className="p-2 sm:p-3 text-right font-medium">
                              {(item.quantity * item.unitPrice).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ))}
          {groupedSales.length === 0 && (
            <p className="text-center text-gray-400 py-8 text-sm">
              No credit sales found.
            </p>
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="p-2 sm:p-3 md:p-4">Date</th>
                  <th className="p-2 sm:p-3 md:p-4 text-right">Amount</th>
                  <th className="p-2 sm:p-3 md:p-4">Notes</th>
                  <th className="p-2 sm:p-3 md:p-4">Method</th>
                  <th className="p-2 sm:p-3 md:p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customer.creditPayments?.map((cp: any) => (
                  <tr key={cp.id} className="border-b hover:bg-gray-50">
                    <td className="p-2 sm:p-3 md:p-4 text-gray-600">
                      {new Date(cp.paidAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="p-2 sm:p-3 md:p-4 text-right text-green-600 font-semibold">
                      {cp.amount.toFixed(2)} birr
                    </td>
                    <td className="p-2 sm:p-3 md:p-4 text-gray-500">
                      {cp.notes || "\u2014"}
                    </td>
                    <td className="p-2 sm:p-3 md:p-4 text-gray-600">
                      {cp.paymentMethod?.name || "Cash"}
                    </td>
                    <td className="p-2 sm:p-3 md:p-4">
                      <RowActionsMenu
                        items={[
                          { label: "Edit", onClick: () => startEditPayment(cp) },
                          {
                            label: "Delete",
                            color: "text-red-500",
                            onClick: () => handleDeletePayment(cp.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
                {(!customer.creditPayments ||
                  customer.creditPayments.length === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      className="p-6 text-center text-gray-400 text-sm"
                    >
                      No payments yet.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-semibold border-t">
                  <td className="p-2 sm:p-3 md:p-4 text-right text-xs sm:text-sm" colSpan={2}>
                    Total Paid
                  </td>
                  <td className="p-2 sm:p-3 md:p-4 text-right text-green-600" colSpan={3}>
                    {customer.totalPaid.toFixed(2)} birr
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={showPayModal}
        onClose={() => setShowPayModal(false)}
        title="Record Payment"
      >
        <form onSubmit={handleRecordPayment} className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Amount (birr)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Payment Method
            </label>
            <div className="flex gap-2">
              <select
                value={payMethodId}
                onChange={(e) => setPayMethodId(e.target.value)}
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
                  setPayMethodId(String(r.data.id));
                  setNewMethodName("");
                }}
                className="bg-gray-200 px-2 rounded-lg text-xs"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Notes
            </label>
            <input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="e.g. Paid via CBE"
              className="border p-2 rounded-lg w-full text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg text-sm font-medium mt-2 hover:bg-green-700"
          >
            Record Payment
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showEditPayModal}
        onClose={() => { setShowEditPayModal(false); setEditingPayment(null); }}
        title="Edit Payment"
      >
        <form onSubmit={handleUpdatePayment} className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Amount (birr)
            </label>
            <input
              type="number"
              step="0.01"
              min="1"
              value={editPayAmount}
              onChange={(e) => setEditPayAmount(e.target.value)}
              className="border p-2 rounded-lg w-full text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Payment Method
            </label>
            <div className="flex gap-2">
              <select
                value={editPayMethodId}
                onChange={(e) => setEditPayMethodId(e.target.value)}
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
                value={editNewMethodName}
                onChange={(e) => setEditNewMethodName(e.target.value)}
                className="border p-2 rounded-lg w-24 text-sm"
              />
              <button
                type="button"
                onClick={async () => {
                  if (!editNewMethodName.trim()) return;
                  const r = await api.post("/payment-methods", {
                    name: editNewMethodName.trim(),
                  });
                  setPaymentMethods([...paymentMethods, r.data]);
                  setEditPayMethodId(String(r.data.id));
                  setEditNewMethodName("");
                }}
                className="bg-gray-200 px-2 rounded-lg text-xs"
              >
                +
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Notes
            </label>
            <input
              value={editPayNotes}
              onChange={(e) => setEditPayNotes(e.target.value)}
              placeholder="e.g. Paid via CBE"
              className="border p-2 rounded-lg w-full text-sm"
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg text-sm font-medium mt-2 hover:bg-green-700"
          >
            Update Payment
          </button>
        </form>
      </Modal>

      <Modal
        isOpen={showSaleModal}
        onClose={() => setShowSaleModal(false)}
        title="Add Credit Sale"
      >
        <CreditSaleForm
          customerId={Number(id)}
          customerName={customer?.name || ""}
          onCreated={() => { setShowSaleModal(false); fetchCustomer(); }}
          onCancel={() => setShowSaleModal(false)}
        />
      </Modal>
    </div>
  );
}
