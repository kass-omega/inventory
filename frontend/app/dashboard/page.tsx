"use client";
import { getDateRange } from "@/app/components/DateFilter";
import FilterBar from "@/app/components/FilterBar";
import FilterPanel from "@/app/components/FilterPanel";
import SalesReport from "@/app/components/SalesReport";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
];

type DatePreset = "today" | "week" | "month" | "year";

export default function DashboardPage() {
  const { user } = useAuth();

  const [categories, setCategories] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);

  // filters
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("today");
  const [startDate, setStartDate] = useState(() => getDateRange("today").start);
  const [endDate, setEndDate] = useState(() => getDateRange("today").end);

  // data
  const [inventory, setInventory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isOwner = user?.isSuperuser === true;

  useEffect(() => {
    api.get("/categories").then((r) => setCategories(r.data));
    if (isOwner) api.get("/locations").then((r) => setLocations(r.data));
  }, [isOwner]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);

    if (isOwner) {
      setLoading(false);
    } else {
      api
        .get(
          `/products/my-inventory?categoryId=${categoryFilter}&search=${search}`,
        )
        .then((r) => {
          setInventory(r.data || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [user, categoryFilter, search, isOwner]);

  if (loading) return <div className="p-8 text-gray-400">Loading...</div>;

  // --- SCOPED (shop/store) VIEW ---
  if (!isOwner) {
    return (
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
              Dashboard
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm mt-1">
              Welcome back, <span className="font-semibold">{user?.roleName}</span>.
            </p>
          </div>
        </div>
        <FilterBar
          search={search}
          onSearchChange={setSearch}
          category={categoryFilter}
          onCategoryChange={setCategoryFilter}
          categories={categories}
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 mt-6 gap-6">
          {/* Inventory table */}
          <div
            className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col"
            style={{ height: "calc(100vh - 13rem)" }}
          >
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0">
              <h3 className="text-gray-700 text-base sm:text-lg font-semibold">
                {user?.locationType === "SHOP"
                  ? "Your Shop Inventory"
                  : "Your Store Inventory"}
              </h3>
            </div>
            <div className="overflow-auto flex-1">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-gray-50 border-b sticky top-0">
                  <tr>
                    <th className="p-2 sm:p-3 pl-4 sm:pl-6">Product</th>
                    <th className="p-2 sm:p-3 text-center w-20 sm:w-24">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((inv: any) => (
                    <tr
                      key={inv.productName}
                      className="border-b hover:bg-gray-50"
                    >
                      <td className="p-2 sm:p-3 pl-4 sm:pl-6 font-medium text-gray-800">
                        {inv.productName}
                      </td>
                      <td
                        className={`p-2 sm:p-3 text-center font-bold text-xs sm:text-sm ${inv.quantity < 10 ? "text-red-500" : "text-blue-600"}`}
                      >
                        {inv.quantity}
                      </td>
                    </tr>
                  ))}
                  {inventory.length === 0 && (
                    <tr>
                      <td colSpan={2} className="p-4 sm:p-6 text-center text-gray-400">
                        No inventory yet. Request stock from your store to get
                        started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bar chart */}
          <div
            className="bg-white rounded-xl shadow-sm border overflow-hidden flex flex-col"
            style={{ height: "calc(100vh - 12rem)" }}
          >
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b flex-shrink-0">
              <h3 className="text-gray-700 text-base sm:text-lg font-semibold">
                Stock Overview
              </h3>
            </div>
            <div className="p-3 sm:p-4 overflow-auto flex-1 flex items-center justify-center">
              <div
                className="w-full"
                style={{ minHeight: `${inventory.slice(0, 20).length * 32}px` }}
              >
                <ResponsiveContainer
                  width="100%"
                  height={Math.max(250, inventory.slice(0, 20).length * 32)}
                >
                  <BarChart
                    data={inventory.slice(0, 20)}
                    layout="vertical"
                    margin={{ left: 4, right: 12, top: 4, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#f0f0f0"
                    />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis
                      type="category"
                      dataKey="productName"
                      tick={{ fontSize: 10 }}
                      width={110}
                      interval={0}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 8,
                        border: "1px solid #e5e7eb",
                      }}
                      cursor={{ fill: "#f9fafb" }}
                    />
                    <Bar dataKey="quantity" radius={[0, 4, 4, 0]} barSize={16}>
                      {inventory.slice(0, 20).map((_: any, i: number) => (
                        <Cell
                          key={i}
                          fill={_.quantity < 10 ? "#ef4444" : "#3b82f6"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- SUPERUSER VIEW ---
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Dashboard
        </h1>
        <p className="text-gray-500 text-xs sm:text-sm mt-1">Welcome back, Owner.</p>
      </div>
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
        showLocation
      />
      <div className="mt-6">
        <SalesReport
          startDate={startDate}
          endDate={endDate}
          categoryId={categoryFilter}
          locationId={locationFilter}
          search={search}
          compact
        />
      </div>
    </div>
  );
}
