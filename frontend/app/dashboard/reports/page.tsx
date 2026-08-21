"use client";
import { getDateRange } from "@/app/components/DateFilter";
import FilterPanel from "@/app/components/FilterPanel";
import Modal from "@/app/components/Modal";
import SalesReport from "@/app/components/SalesReport";
import { useToast } from "@/app/components/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type DatePreset = "today" | "week" | "month" | "year";

export default function ReportsPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get("tab") || "sales");

  useEffect(() => {
    if (user && !user.isSuperuser && tab === "sales") setTab("inventory");
  }, [user]);

  const [inventoryData, setInventoryData] = useState<any>({
    columns: [],
    rows: [],
  });
  const [lowStock, setLowStock] = useState<any[]>([]);
  const [deadStock, setDeadStock] = useState<any[]>([]);
  const [auditTrail, setAuditTrail] = useState<any[]>([]);

  // shared filters
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // date filters
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [startDate, setStartDate] = useState(() => getDateRange("today").start);
  const [endDate, setEndDate] = useState(() => getDateRange("today").end);

  // Quick Request Modal
  const [showReqModal, setShowReqModal] = useState(false);
  const [stores, setStores] = useState<any[]>([]);
  const [reqForm, setReqForm] = useState({
    productId: "",
    productName: "",
    storeId: "",
    quantity: 1,
  });

  const isOwner = user?.isSuperuser === true;

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    if (isOwner) api.get("/locations").then((r) => setLocations(r.data));
    if (user?.locationType === "SHOP") {
      api
        .get("/locations")
        .then((r) => setStores(r.data.filter((l: any) => l.type === "STORE")));
    }
  }, [user, isOwner]);

  useEffect(() => {
    const query = `search=${search}&categoryId=${category}&locationId=${location}&startDate=${startDate}&endDate=${endDate}`;

    if (tab === "inventory") {
      api
        .get(`/reports/inventory-breakdown?${query}`)
        .then((r) => setInventoryData(r.data));
    } else if (tab === "sales" && isOwner) {
      // handled by SalesReport component
    } else if (tab === "low-stock") {
      api.get(`/reports/low-stock?${query}`).then((r) => setLowStock(r.data));
    } else if (tab === "dead-stock") {
      api.get(`/reports/dead-stock?${query}`).then((r) => setDeadStock(r.data));
    } else if (tab === "audit-trail" && isOwner) {
      api.get("/reports/audit-trail").then((r) => setAuditTrail(r.data));
    }
  }, [tab, search, category, location, startDate, endDate, user, isOwner]);

  const handleQuickRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/requests", {
        storeId: Number(reqForm.storeId),
        items: [
          {
            productId: Number(reqForm.productId),
            quantityRequested: Number(reqForm.quantity),
          },
        ],
      });
      setShowReqModal(false);
      setReqForm({ productId: "", productName: "", storeId: "", quantity: 1 });
      toast.success("Request submitted!");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to create request.");
    }
  };

  const tabs = [
    { id: "sales", label: "Sales & Profit", permission: "reports.full" },
    { id: "inventory", label: "Inventory", permission: "reports.view" },
    { id: "low-stock", label: "Low Stock", permission: "reports.view" },
    { id: "dead-stock", label: "Dead Stock", permission: "reports.view" },
    { id: "audit-trail", label: "Audit Trail", permission: "reports.full" },
  ].filter((t) => hasPermission(t.permission));

  const downloadFile = async (path: string, filename: string) => {
    try {
      const res = await api.get(path, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      markHandled(err);
      toast.error("Export failed.");
    }
  };

  const fullQuery = `search=${search}&categoryId=${category}&locationId=${location}&startDate=${startDate}&endDate=${endDate}`;

  const exportCfg = (() => {
    const q = `search=${search}&categoryId=${category}&locationId=${location}`;
    const sq = `${q}&startDate=${startDate}&endDate=${endDate}`;
    switch (tab) {
      case "sales":
        return {
          label: "Sales",
          csv: `/reports/sales-summary/export?${sq}`,
          pdf: `/reports/sales-summary/pdf?${sq}`,
          csvName: "sales-profit.csv",
          pdfName: "sales-profit.pdf",
        };
      case "inventory":
        return {
          label: "Inventory",
          csv: `/reports/inventory-breakdown/export?${q}`,
          pdf: `/reports/inventory-breakdown/pdf?${q}`,
          csvName: "inventory-breakdown.csv",
          pdfName: "inventory-breakdown.pdf",
        };
      case "low-stock":
        return {
          label: "Low Stock",
          csv: `/reports/low-stock/export?${q}`,
          pdf: `/reports/low-stock/pdf?${q}`,
          csvName: "low-stock.csv",
          pdfName: "low-stock.pdf",
        };
      case "dead-stock":
        return {
          label: "Dead Stock",
          csv: `/reports/dead-stock/export?${q}`,
          pdf: `/reports/dead-stock/pdf?${q}`,
          csvName: "dead-stock.csv",
          pdfName: "dead-stock.pdf",
        };
      default:
        return null;
    }
  })();

  return (
    <div>
      <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-6">
        Reports
      </h1>

      {/* Tabs */}
      <div className="flex gap-0.5 sm:gap-1 mb-6 border-b overflow-x-auto pb-px">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-2.5 sm:px-4 py-2 sm:py-2.5 whitespace-nowrap text-xs sm:text-sm font-medium rounded-t-lg transition ${
              tab === t.id
                ? "bg-white text-blue-600 border border-b-white -mb-px shadow-sm"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter Bar — common across all tabs except audit-trail */}
      {tab !== "audit-trail" && (
        <FilterPanel
          showDateFilter={tab === "sales"}
          datePreset={datePreset}
          onDatePresetChange={setDatePreset}
          startDate={startDate}
          onStartDateChange={setStartDate}
          endDate={endDate}
          onEndDateChange={setEndDate}
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          categories={categories}
          location={location}
          onLocationChange={setLocation}
          locations={locations}
          showLocation={isOwner}
        />
      )}

      {/* Export buttons */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Export:</span>
        {exportCfg && (
          <>
            <button
              onClick={() => downloadFile(exportCfg.csv, exportCfg.csvName)}
              className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              Export {exportCfg.label} CSV
            </button>
            <button
              onClick={() => downloadFile(exportCfg.pdf, exportCfg.pdfName)}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Export {exportCfg.label} PDF
            </button>
          </>
        )}
        {isOwner && (
          <>
            <span className="mx-1 text-gray-300">|</span>
            <button
              onClick={() =>
                downloadFile(`/reports/full/export?${fullQuery}`, "full-report.csv")
              }
              className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              Export All Reports CSV
            </button>
            <button
              onClick={() =>
                downloadFile(`/reports/full/pdf?${fullQuery}`, "full-report.pdf")
              }
              className="bg-gray-800 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-gray-700"
            >
              Export All Reports PDF
            </button>
          </>
        )}
      </div>

      {/* INVENTORY */}
      {tab === "inventory" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left min-w-[600px] sm:min-w-[800px] text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">Product</th>
                <th className="p-2 sm:p-3 md:p-4 text-center">Total</th>
                {inventoryData.columns?.map((col: string) => (
                  <th key={col} className="p-2 sm:p-3 md:p-4 text-center">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {inventoryData.rows?.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 font-medium">
                    {r.productName}
                    <span className="block text-[10px] sm:text-xs text-gray-400">
                      {r.category}
                    </span>
                  </td>
                  <td
                    className={`p-2 sm:p-3 md:p-4 text-center font-bold ${r.total < 10 ? "text-red-500" : "text-blue-600"}`}
                  >
                    {r.total}
                  </td>
                  {inventoryData.columns?.map((col: string) => (
                    <td key={col} className="p-2 sm:p-3 md:p-4 text-center text-gray-600">
                      {r.locations[col] || 0}
                    </td>
                  ))}
                </tr>
              ))}
              {inventoryData.rows?.length === 0 && (
                <tr>
                  <td colSpan={99} className="p-4 sm:p-6 text-center text-gray-400 text-xs sm:text-sm">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* SALES */}
      {/* SALES */}
      {tab === "sales" && isOwner && (
        <SalesReport
          startDate={startDate}
          endDate={endDate}
          categoryId={category}
          locationId={location}
          search={search}
        />
      )}
      {tab === "low-stock" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">Product</th>
                {isOwner && <th className="p-2 sm:p-3 md:p-4">Location</th>}
                <th className="p-2 sm:p-3 md:p-4 text-center">Stock</th>
                {user?.locationType === "SHOP" && (
                  <th className="p-2 sm:p-3 md:p-4 text-right">Action</th>
                )}
              </tr>
            </thead>
            <tbody>
              {lowStock.map((r: any) => (
                <tr key={r.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 font-medium">{r.name}</td>
                  {isOwner && (
                    <td className="p-2 sm:p-3 md:p-4 text-gray-500 text-xs sm:text-sm">
                      {r.locationName || "—"}
                    </td>
                  )}
                  <td className="p-2 sm:p-3 md:p-4 text-center text-red-500 font-bold">
                    {r.total}
                  </td>
                  {user?.locationType === "SHOP" && (
                    <td className="p-2 sm:p-3 md:p-4 text-right">
                      {r.requestedStatus ? (
                        <span className="text-[10px] sm:text-xs bg-yellow-100 text-yellow-800 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full font-medium">
                          {r.requestedStatus}
                        </span>
                      ) : (
                        <button
                          onClick={() => {
                            setReqForm({
                              productId: r.id,
                              productName: r.name,
                              storeId: "",
                              quantity: 1,
                            });
                            setShowReqModal(true);
                          }}
                          className="bg-blue-600 text-white px-2 sm:px-3 py-1 sm:py-1.5 text-xs rounded-lg hover:bg-blue-700 font-medium"
                        >
                          Request Stock
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {lowStock.length === 0 && (
                <tr>
                  <td
                    colSpan={isOwner ? 4 : 3}
                    className="p-4 sm:p-6 text-center text-gray-400 text-xs sm:text-sm"
                  >
                    All stock levels are healthy!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* DEAD STOCK */}
      {tab === "dead-stock" && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">Product</th>
                {isOwner && <th className="p-2 sm:p-3 md:p-4">Location</th>}
                <th className="p-2 sm:p-3 md:p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {deadStock.map((r: any, i: number) => (
                <tr key={i} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 font-medium">{r.name}</td>
                  {isOwner && (
                    <td className="p-2 sm:p-3 md:p-4 text-gray-500 text-xs sm:text-sm">
                      {r.locationName || "—"}
                    </td>
                  )}
                  <td className="p-2 sm:p-3 md:p-4">
                    <span className="text-[10px] sm:text-xs bg-red-100 text-red-700 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full font-medium">
                      No sales in 3 months
                    </span>
                  </td>
                </tr>
              ))}
              {deadStock.length === 0 && (
                <tr>
                  <td
                    colSpan={isOwner ? 3 : 2}
                    className="p-4 sm:p-6 text-center text-gray-400 text-xs sm:text-sm"
                  >
                    No dead stock found!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* AUDIT TRAIL */}
      {tab === "audit-trail" && isOwner && (
        <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
          <table className="w-full text-left min-w-[500px] sm:min-w-[600px] text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3 md:p-4">Date & Time</th>
                <th className="p-2 sm:p-3 md:p-4">User</th>
                <th className="p-2 sm:p-3 md:p-4">Action</th>
                <th className="p-2 sm:p-3 md:p-4">Details</th>
              </tr>
            </thead>
            <tbody>
              {auditTrail.map((log: any) => (
                <tr key={log.id} className="border-b hover:bg-gray-50">
                  <td className="p-2 sm:p-3 md:p-4 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="p-2 sm:p-3 md:p-4 font-medium">
                    {log.user?.name || "System"}
                  </td>
                  <td className="p-2 sm:p-3 md:p-4">
                    <span className="bg-blue-100 text-blue-800 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-2 sm:p-3 md:p-4 text-gray-700">{log.details}</td>
                </tr>
              ))}
              {auditTrail.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 sm:p-6 text-center text-gray-400 text-xs sm:text-sm">
                    No activity yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Quick Request Modal */}
      <Modal
        isOpen={showReqModal}
        onClose={() => setShowReqModal(false)}
        title="Request Stock"
      >
        <form onSubmit={handleQuickRequest} className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Product
            </label>
            <input
              value={reqForm.productName}
              disabled
              className="border p-2 rounded-lg w-full bg-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Store
            </label>
            <select
              value={reqForm.storeId}
              onChange={(e) =>
                setReqForm({ ...reqForm, storeId: e.target.value })
              }
              className="border p-2 rounded-lg w-full bg-white"
              required
            >
              <option value="">Select Store</option>
              {stores.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">
              Quantity
            </label>
            <input
              type="number"
              min="1"
              value={reqForm.quantity}
              onChange={(e) =>
                setReqForm({ ...reqForm, quantity: Number(e.target.value) })
              }
              className="border p-2 rounded-lg w-full"
              required
            />
          </div>
          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg mt-2 font-medium"
          >
            Submit Request
          </button>
        </form>
      </Modal>
    </div>
  );
}
