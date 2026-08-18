"use client";
import api from "@/lib/api";
import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

interface Props {
  startDate: string;
  endDate: string;
  categoryId: string;
  locationId: string;
  search: string;
  compact?: boolean;
}

export default function SalesReport({ startDate, endDate, categoryId, locationId, search, compact }: Props) {
  const [summary, setSummary] = useState<any>(null);
  const [trend, setTrend] = useState<any[]>([]);
  const [mostSold, setMostSold] = useState<any[]>([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState<any[]>([]);
  const [unified, setUnified] = useState<any>(null);
  const [view, setView] = useState<"summary" | "charts">("charts");

  useEffect(() => {
    const query = `startDate=${startDate}&endDate=${endDate}&categoryId=${categoryId}&search=${search}&locationId=${locationId}`;
    Promise.all([
      api.get(`/reports/sales-summary?${query}`).catch(() => ({ data: null })),
      api.get(`/reports/sales-trend?${query}`).catch(() => ({ data: [] })),
      api.get(`/reports/most-sold?${query}`).catch(() => ({ data: [] })),
      api.get(`/reports/payment-methods-breakdown?${query}`).catch(() => ({ data: [] })),
      api.get(`/reports/unified-stats?startDate=${startDate}&endDate=${endDate}&locationId=${locationId}&categoryId=${categoryId}&search=${search}`).catch(() => ({ data: null })),
    ]).then(([s, t, m, p, u]) => {
      setSummary(s.data);
      setTrend(t.data);
      setMostSold(m.data);
      setPaymentBreakdown(p.data);
      setUnified(u.data);
    });
  }, [startDate, endDate, categoryId, locationId, search]);

  if (!unified && !summary) return <div className="p-8 text-gray-400">Loading...</div>;

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="relative flex bg-gray-200 rounded-full p-0.5 w-44">
        <div
          className={`absolute top-0.5 bottom-0.5 w-[5.25rem] rounded-full bg-white shadow-sm transition-all duration-200 ${
            view === "charts" ? "left-0.5" : "left-[5.5rem]"
          }`}
        />
        {(["charts", "summary"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`relative z-10 flex-1 py-1.5 text-xs font-medium rounded-full transition-colors ${
              view === v ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
            }`}>
            {v === "summary" ? "Summary" : "Charts"}
          </button>
        ))}
      </div>

      {view === "summary" && (
        <div className="space-y-4">
          {/* Sales — inline, from unified */}
          {unified && (
            <div className="bg-white rounded-xl shadow-sm border px-4 py-3 flex items-center gap-4 text-sm flex-wrap">
              <span className="text-xs uppercase text-gray-400 font-semibold">Sales</span>
              <div className="w-px h-6 bg-gray-200" />
              <span>Revenue <strong className="text-gray-800">{unified.sales.revenue.toFixed(2)} birr</strong></span>
              <span className="text-gray-300">|</span>
              <span>Cost <strong className="text-gray-800">{unified.sales.cost.toFixed(2)} birr</strong></span>
              <span className="text-gray-300">|</span>
              <span>Profit <strong className="text-green-600">{unified.sales.profit.toFixed(2)} birr</strong></span>
              <span className="text-gray-300">|</span>
              <span>Count <strong className="text-gray-800">{unified.sales.count}</strong></span>
              <span className="text-gray-300">|</span>
              <span>Margin <strong className="text-blue-600">{unified.sales.margin}%</strong></span>
              {unified.sales.breakdown && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="text-xs">Paid <strong className="text-green-700">{unified.sales.breakdown.fullyPaid.revenue.toFixed(0)}</strong></span>
                  <span className="text-xs">Partial <strong className="text-yellow-700">{unified.sales.breakdown.partiallyPaid.revenue.toFixed(0)}</strong></span>
                  <span className="text-xs">Credit <strong className="text-red-700">{unified.sales.breakdown.credited.revenue.toFixed(0)}</strong></span>
                </>
              )}
            </div>
          )}

          {/* Quick Purchases & Combined — inline */}
          {unified && (
            <>
              <div className="bg-white rounded-xl shadow-sm border px-4 py-3 flex items-center gap-4 text-sm flex-wrap">
                <span className="text-xs uppercase text-gray-400 font-semibold">Quick Purchases</span>
                <div className="w-px h-6 bg-gray-200" />
                <span>Revenue <strong className="text-gray-800">{unified.flips.revenue.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Cost <strong className="text-gray-800">{unified.flips.cost.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Profit <strong className={unified.flips.profit >= 0 ? "text-green-600" : "text-red-600"}>{unified.flips.profit.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Count <strong className="text-gray-800">{unified.flips.count}</strong></span>
                <span className="text-gray-300">|</span>
                <span>Margin <strong className="text-blue-600">{unified.flips.margin}%</strong></span>
              </div>

              <div className="bg-blue-50 rounded-xl shadow-sm border border-blue-100 px-4 py-3 flex items-center gap-4 text-sm flex-wrap">
                <span className="text-xs uppercase text-blue-400 font-semibold">Combined</span>
                <div className="w-px h-6 bg-blue-200" />
                <span>Revenue <strong className="text-gray-800">{unified.combined.totalRevenue.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Cost <strong className="text-gray-800">{unified.combined.totalCost.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Profit <strong className={unified.combined.netProfit >= 0 ? "text-green-600" : "text-red-600"}>{unified.combined.netProfit.toFixed(2)} birr</strong></span>
                <span className="text-gray-300">|</span>
                <span>Margin <strong className="text-blue-600">{unified.combined.margin}%</strong></span>
              </div>
            </>
          )}
        </div>
      )}

      {view === "charts" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Sales Trend */}
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Sales Trend</h3>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="date" fontSize={10} tickMargin={8} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="flips" name="Quick Purchases" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 3" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Sales Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Sales Distribution</h3>
          <div className="h-72 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={mostSold.slice(0, 8)} dataKey="qty" nameKey="name" cx="50%" cy="45%"
                outerRadius={compact ? 55 : 72} innerRadius={compact ? 25 : 32} paddingAngle={2}>
                  {mostSold.slice(0, 8).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Methods Pie */}
        {paymentBreakdown.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Payment Methods</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentBreakdown} dataKey="totalAmount" nameKey="method" cx="50%" cy="45%"
                    outerRadius={compact ? 60 : 72}
                    label={({ method, totalAmount }: any) => `${method} ${totalAmount.toFixed(0)} birr`}>
                    {paymentBreakdown.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }}
                    formatter={(value: any) => [`${Number(value).toFixed(2)} birr`, "Amount"]} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Top Selling Products */}
        <div className={`bg-white rounded-xl shadow-sm border p-4 sm:p-6 ${compact ? "lg:col-span-2" : "lg:col-span-1"}`}>
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Top Selling Products</h3>
          <div className="h-56 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={mostSold} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" fontSize={10} tickMargin={8} angle={-20} textAnchor="end" height={60} />
                <YAxis fontSize={10} />
                <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                  {mostSold.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      )}

      {/* Payment Methods Table */}
      {view === "summary" && paymentBreakdown.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border p-4 sm:p-6">
          <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Payment Methods</h3>
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-2 sm:p-3">Method</th>
                <th className="p-2 sm:p-3 text-right">Count</th>
                <th className="p-2 sm:p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {paymentBreakdown.map((pm: any) => (
                <tr key={pm.method} className="border-b">
                  <td className="p-2 sm:p-3 font-medium">{pm.method}</td>
                  <td className="p-2 sm:p-3 text-right">{pm.count}</td>
                  <td className="p-2 sm:p-3 text-right font-semibold">${pm.totalAmount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}