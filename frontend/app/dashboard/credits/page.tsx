"use client";
import CreditSaleForm from "@/app/components/CreditSaleForm";
import CustomerForm from "@/app/components/CustomerForm";
import Modal from "@/app/components/Modal";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import { useToast } from "@/app/components/ToastProvider";
import { useConfirm } from "@/app/components/ConfirmProvider";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function CreditsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const isOwner = user?.isSuperuser === true;
  const [customers, setCustomers] = useState<any[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState(
    isOwner ? "" : String(user?.locationId || ""),
  );
  const [onlyDebt, setOnlyDebt] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [saleCustomer, setSaleCustomer] = useState<any>(null);
  const [showSaleModal, setShowSaleModal] = useState(false);

  const fetchCustomers = async () => {
    const shopId = locationFilter || (isOwner ? "" : user?.locationId);
    const params = new URLSearchParams();
    if (shopId) params.set("shopId", String(shopId));
    const res = await api.get(`/customers?${params}`);
    setCustomers(res.data);
  };

  useEffect(() => {
    if (isOwner)
      api
        .get("/locations")
        .then((r) =>
          setLocations(r.data.filter((l: any) => l.type === "SHOP")),
        );
    fetchCustomers();
  }, [locationFilter]);

  const filtered = customers.filter((c: any) => {
    const m =
      !search ||
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.phone || "").includes(search);
    const debt = !onlyDebt || c.remaining > 0;
    return m && debt;
  });

  const handleDelete = async (id: number) => {
    const ok = await confirm("Delete this customer? This will also remove all related credit sales and payments.");
    if (!ok) return;
    try {
      await api.delete(`/customers/${id}`);
      fetchCustomers();
      toast.success("Customer deleted");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to delete customer");
    }
  };

  return (
    <div>
      <div className="flex justify-between items-start md:items-center mb-6 gap-3">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Credits
        </h1>
        <button
          onClick={() => setShowNewModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap"
        >
          + New Customer
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          placeholder="Search by name or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border p-2 rounded-lg flex-1 text-sm"
        />
        {isOwner && (
          <select
            value={locationFilter}
            onChange={(e) => setLocationFilter(e.target.value)}
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
        <label className="flex items-center gap-1.5 text-xs sm:text-sm text-gray-600 whitespace-nowrap">
          <input
            type="checkbox"
            checked={onlyDebt}
            onChange={(e) => setOnlyDebt(e.target.checked)}
            className="rounded"
          />{" "}
          Only with debt
        </label>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-left text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">Name</th>
              <th className="p-2 sm:p-3 md:p-4 hidden sm:table-cell">Phone</th>
              <th className="p-2 sm:p-3 md:p-4 text-right">Tot. Credits</th>
              <th className="p-2 sm:p-3 md:p-4 text-right hidden sm:table-cell">
                Tot. Paid
              </th>
              <th className="p-2 sm:p-3 md:p-4 text-right">Remaining</th>
              <th className="p-2 sm:p-3 md:p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c: any) => (
              <tr key={c.id} className="border-b hover:bg-gray-50">
                <td className="p-2 sm:p-3 md:p-4 font-medium">{c.name}</td>
                <td className="p-2 sm:p-3 md:p-4 text-gray-500 hidden sm:table-cell">
                  {c.phone || "—"}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-right">
                  {c.totalCredits.toFixed(2)} birr
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-right text-green-600 hidden sm:table-cell">
                  {c.totalPaid.toFixed(2)} birr
                </td>
                <td
                  className={`p-2 sm:p-3 md:p-4 text-right font-bold ${c.remaining > 0 ? "text-red-500" : "text-green-600"}`}
                >
                  {c.remaining.toFixed(2)} birr
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  <RowActionsMenu
                    items={[
                      {
                        label: "View",
                        onClick: () => router.push(`/dashboard/credits/${c.id}`),
                      },
                      {
                        label: "Sale",
                        color: "text-green-600",
                        onClick: () => {
                          setSaleCustomer(c);
                          setShowSaleModal(true);
                        },
                      },
                      {
                        label: "Edit",
                        onClick: () => {
                          setEditingCustomer(c);
                          setShowEditModal(true);
                        },
                      },
                      {
                        label: "Delete",
                        color: "text-red-500",
                        onClick: () => handleDelete(c.id),
                      },
                    ]}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-gray-400 text-sm"
                >
                  No customers found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showNewModal}
        onClose={() => setShowNewModal(false)}
        title="New Customer"
      >
        <CustomerForm
          onCreated={() => {
            setShowNewModal(false);
            fetchCustomers();
          }}
          onCancel={() => setShowNewModal(false)}
        />
      </Modal>

      <Modal
        isOpen={showEditModal}
        onClose={() => { setShowEditModal(false); setEditingCustomer(null); }}
        title="Edit Customer"
      >
        <CustomerForm
          initialData={editingCustomer}
          onCreated={() => {}}
          onUpdated={() => {
            setShowEditModal(false);
            setEditingCustomer(null);
            fetchCustomers();
          }}
          onCancel={() => { setShowEditModal(false); setEditingCustomer(null); }}
        />
      </Modal>

      <Modal
        isOpen={showSaleModal}
        onClose={() => { setShowSaleModal(false); setSaleCustomer(null); }}
        title="Add Credit Sale"
      >
        {saleCustomer && (
          <CreditSaleForm
            customerId={saleCustomer.id}
            customerName={saleCustomer.name}
            onCreated={() => { setShowSaleModal(false); setSaleCustomer(null); fetchCustomers(); }}
            onCancel={() => { setShowSaleModal(false); setSaleCustomer(null); }}
          />
        )}
      </Modal>
    </div>
  );
}
