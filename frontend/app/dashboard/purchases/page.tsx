"use client";
import { getDateRange } from "@/app/components/DateFilter";
import FilterPanel from "@/app/components/FilterPanel";
import Modal from "@/app/components/Modal";
import Loading from "@/app/components/Loading";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useToast } from "@/app/components/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useEffect, useState } from "react";

type DatePreset = "today" | "week" | "month" | "year";

export default function PurchasesPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const isOwner = user?.isSuperuser === true;
  const [purchases, setPurchases] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [startDate, setStartDate] = useState(() => getDateRange("month").start);
  const [endDate, setEndDate] = useState(() => getDateRange("month").end);
  const [shopFilter, setShopFilter] = useState("");
  const [shops, setShops] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [form, setForm] = useState({ productName: "", quantity: 1, unitPrice: 0, sellPrice: 0, notes: "", paymentMethodId: "" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [daySheet, setDaySheet] = useState<any>(null);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);

  const fetchPurchases = async () => {
    setFetching(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      if (shopFilter) params.set("shopId", shopFilter);
      const query = params.toString();
      const [res, sres] = await Promise.all([
        api.get(`/purchases${query ? "?" + query : ""}`),
        api.get(`/purchases/stats?${query}`),
      ]);
      setPurchases(res.data);
      setStats(sres.data);
    } finally {
      setFetching(false);
    }
  };
  useEffect(() => { fetchPurchases(); }, [statusFilter, search, startDate, endDate, shopFilter]);

  useEffect(() => {
    api.get("/payment-methods").then(r => setPaymentMethods(r.data)).catch(() => {});
    api.get(`/reports/day-sheet?locationId=${shopFilter || ""}&startDate=${startDate}&endDate=${endDate}`)
      .then(r => setDaySheet(r.data)).catch(() => {});
  }, [shopFilter, startDate, endDate]);

  useEffect(() => {
    if (isOwner) api.get("/locations").then(r => {
      setLocations(r.data);
      setShops(r.data.filter((l: any) => l.type === "SHOP"));
    });
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post("/purchases", { productName: form.productName, quantity: Number(form.quantity), unitPrice: Number(form.unitPrice), sellPrice: Number(form.sellPrice), notes: form.notes || undefined, paymentMethodId: form.paymentMethodId ? Number(form.paymentMethodId) : undefined });
      setShowForm(false); setForm({ productName: "", quantity: 1, unitPrice: 0, sellPrice: 0, notes: "", paymentMethodId: "" }); fetchPurchases();
    } catch (err: any) { markHandled(err); toast.error("Failed"); } finally { setLoading(false); }
  };
  const handleApprove = async (id: number) => { try { await api.patch(`/purchases/${id}/approve`); fetchPurchases(); } catch (err: any) { markHandled(err); toast.error("Failed"); } };
  const handleReject = async (id: number) => { try { await api.patch(`/purchases/${id}/reject`); fetchPurchases(); } catch (err: any) { markHandled(err); toast.error("Failed"); } };

  const badge = (s: string) => (<span className={"px-2 py-0.5 text-xs rounded-full font-semibold " + (s==="PENDING"?"bg-yellow-100 text-yellow-800":s==="APPROVED"?"bg-green-100 text-green-800":"bg-red-100 text-red-800")}>{s}</span>);

  if (fetching) return <Loading className="py-24" />;

  return (
    <div>
      <div className="flex justify-between items-start md:items-center mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">Quick Purchases</h1>
        {hasPermission("purchases.create") && <button onClick={()=>setShowForm(true)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap">+ New Quick Purchase</button>}
      </div>

      <FilterPanel
        showDateFilter
        datePreset={datePreset}
        onDatePresetChange={(p) => {
          setDatePreset(p);
          const range = getDateRange(p);
          setStartDate(range.start);
          setEndDate(range.end);
        }}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        search={search}
        onSearchChange={setSearch}
        category=""
        onCategoryChange={() => {}}
        categories={[]}
        location={shopFilter}
        onLocationChange={setShopFilter}
        locations={locations}
        showLocation={isOwner}
      />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            ...(isOwner
              ? [{ label: "Cost", value: stats.totalCost.toFixed(2) + " birr", color: "text-gray-800" }]
              : []),
            { label: "Revenue", value: stats.totalRevenue.toFixed(2) + " birr", color: "text-blue-700" },
            ...(isOwner
              ? [{ label: "Profit", value: stats.totalProfit.toFixed(2) + " birr", color: stats.totalProfit >= 0 ? "text-green-700" : "text-red-700" }]
              : []),
            { label: "Pending", value: stats.pendingCount, color: "text-yellow-700" },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl shadow-sm border p-3 sm:p-4">
              <div className="text-xs text-gray-500">{s.label}</div>
              <div className={"text-lg font-bold " + s.color}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {daySheet && (
        <div className="bg-white rounded-xl shadow-sm border p-3 sm:p-4 mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <div><span className="text-xs uppercase text-gray-400 font-semibold mr-2">Opening Cash</span><strong>{daySheet.opening.toFixed(2)} birr</strong></div>
          <div><span className="text-xs uppercase text-gray-400 font-semibold mr-2">Inflow</span><strong className="text-green-600">+{daySheet.totalInflow.toFixed(2)} birr</strong></div>
          <div><span className="text-xs uppercase text-gray-400 font-semibold mr-2">Outflow</span><strong className="text-red-600">-{daySheet.totalOutflow.toFixed(2)} birr</strong></div>
          <div><span className="text-xs uppercase text-gray-400 font-semibold mr-2">Closing Cash</span><strong className="text-blue-700">{daySheet.closing.toFixed(2)} birr</strong></div>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="border p-2 rounded-lg bg-white text-sm">
          <option value="">All Status</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option>
        </select>
      </div>
      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left min-w-[500px] text-xs sm:text-sm"><thead className="bg-gray-50 border-b"><tr>
          <th className="p-2 sm:p-3 md:p-4">Product</th><th className="p-2 sm:p-3 md:p-4">Shop</th><th className="p-2 sm:p-3 md:p-4">Qty</th>
          <th className="p-2 sm:p-3 md:p-4 text-right">Unit Price</th><th className="p-2 sm:p-3 md:p-4 text-right">Sell Price</th>
          {isOwner && <th className="p-2 sm:p-3 md:p-4 text-right">Profit</th>}
          <th className="p-2 sm:p-3 md:p-4">Invoice</th>
          <th className="p-2 sm:p-3 md:p-4">Status</th>
          {isOwner && <th className="p-2 sm:p-3 md:p-4">Actions</th>}
        </tr></thead><tbody>
          {purchases.map((p:any) => (<tr key={p.id} className="border-b hover:bg-gray-50">
            <td className="p-2 sm:p-3 md:p-4 font-medium whitespace-nowrap">{p.productName}</td>
            <td className="p-2 sm:p-3 md:p-4 text-gray-500 whitespace-nowrap">{p.shop?.name}</td>
            <td className="p-2 sm:p-3 md:p-4">{p.quantity}</td>
            <td className="p-2 sm:p-3 md:p-4 text-right">{p.unitPrice.toFixed(2)} birr</td>
            <td className="p-2 sm:p-3 md:p-4 text-right">{p.sellPrice.toFixed(2)} birr</td>
            {isOwner && <td className={"p-2 sm:p-3 md:p-4 text-right font-semibold " + (p.profit >= 0 ? "text-green-600" : "text-red-500")}>{p.profit.toFixed(2)} birr</td>}
            <td className="p-2 sm:p-3 md:p-4 font-mono text-xs">{p.sale?.invoiceNumber || "—"}</td>
            <td className="p-2 sm:p-3 md:p-4">{badge(p.status)}</td>
            {isOwner && <td className="p-2 sm:p-3 md:p-4">{p.status==="PENDING" && <RowActionsMenu items={[{label:"Approve", color:"text-green-600", onClick:()=>handleApprove(p.id)},{label:"Reject", color:"text-red-500", onClick:()=>handleReject(p.id)}]} />}</td>}
          </tr>))}
          {purchases.length===0 && <tr><td colSpan={isOwner?9:7} className="p-6 text-center text-gray-400 text-sm">No purchases found.</td></tr>}
        </tbody></table>
      </div>
      <Modal isOpen={showForm} onClose={()=>setShowForm(false)} title="New Quick Purchase">
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4">
          <div><label className="block text-sm font-medium text-gray-500 mb-1">Product Name</label>
            <input value={form.productName} onChange={e=>setForm({...form,productName:e.target.value})} placeholder="e.g. Philips 9W Bulb" className="border p-2 rounded-lg w-full text-sm" required/>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div><label className="block text-sm font-medium text-gray-500 mb-1">Quantity</label>
              <input type="number" min="1" value={form.quantity} onChange={e=>setForm({...form,quantity:Number(e.target.value)})} className="border p-2 rounded-lg w-full text-sm" required/>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">Buy Price (birr)</label>
              <input type="number" step="0.01" min="0" value={form.unitPrice} onChange={e=>setForm({...form,unitPrice:Number(e.target.value)})} className="border p-2 rounded-lg w-full text-sm" required/>
            </div>
            <div><label className="block text-sm font-medium text-gray-500 mb-1">Sell Price (birr)</label>
              <input type="number" step="0.01" min="0" value={form.sellPrice} onChange={e=>setForm({...form,sellPrice:Number(e.target.value)})} className="border p-2 rounded-lg w-full text-sm" required/>
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-500 mb-1">Payment Method</label>
            <select value={form.paymentMethodId} onChange={e=>setForm({...form,paymentMethodId:e.target.value})} className="border p-2 rounded-lg w-full text-sm">
              <option value="">Cash (default)</option>
              {paymentMethods.filter((m:any)=>m.name.toLowerCase()!=="cash").map((m:any)=>(<option key={m.id} value={m.id}>{m.name}</option>))}
            </select>
          </div>
          <div><label className="block text-sm font-medium text-gray-500 mb-1">Notes (optional)</label>
            <input value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} className="border p-2 rounded-lg w-full text-sm"/>
          </div>
          <div className="flex gap-2 mt-2">
            <button type="submit" disabled={loading} className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <Loading size="sm" />
                  Saving...
                </span>
              ) : (
                "Submit"
              )}
            </button>
            <button type="button" onClick={()=>setShowForm(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-300">Cancel</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

