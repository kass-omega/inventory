"use client";
import BarcodeScanner from "@/app/components/BarcodeScanner";
import { useConfirm } from "@/app/components/ConfirmProvider";
import FilterRow, { FilterField } from "@/app/components/FilterRow";
import Modal from "@/app/components/Modal";
import Loading from "@/app/components/Loading";
import RowActionsMenu from "@/app/components/RowActionsMenu";
import SearchableSelect from "@/app/components/SearchableSelect";
import { useToast } from "@/app/components/ToastProvider";
import { useAuth } from "@/context/AuthContext";
import api, { markHandled } from "@/lib/api";
import { useEffect, useState } from "react";

export default function RequestsPage() {
  const { user, hasPermission } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [requests, setRequests] = useState([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [productFilter, setProductFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [locations, setLocations] = useState([]);
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState([]);

  // Manage Modal states
  const [selectedReq, setSelectedReq] = useState<any>(null);
  const [itemUpdates, setItemUpdates] = useState<
    { id: number; status: string }[]
  >([]);
  const [dispatchData, setDispatchData] = useState<
    { id: number; quantityDispatched: number }[]
  >([]);
  const [receivedData, setReceivedData] = useState<
    { id: number; quantityReceived: number }[]
  >([]);

  // New Request Modal states
  const [showReqModal, setShowReqModal] = useState(false);
  const [reqStoreId, setReqStoreId] = useState("");
  const [reqItems, setReqItems] = useState<
    { productId: string; quantity: string; categoryId: string }[]
  >([{ productId: "", quantity: "", categoryId: "" }]);

  // Edit mode: the request currently being revised (owner or creator).
  const [editingReq, setEditingReq] = useState<any>(null);
  // Products of the store selected in the request form, with that store's
  // inventory, so shopkeepers can see availability while composing.
  const [storeProducts, setStoreProducts] = useState<any[]>([]);
  const [storeStockMap, setStoreStockMap] = useState<Record<number, number>>(
    {},
  );

  const [loading, setLoading] = useState(true);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const query = `status=${statusFilter}&locationId=${locationFilter}&categoryId=${categoryFilter}&productId=${productFilter}&startDate=${startDate}&endDate=${endDate}`;
      const res = await api.get(`/requests?${query}`);
      setRequests(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/locations").then((res) => {
      setLocations(res.data);
      setStores(res.data.filter((l: any) => l.type === "STORE"));
    });
    api.get("/categories").then((res) => setCategories(res.data));
    api.get("/products").then((res) => setProducts(res.data));
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [
    statusFilter,
    locationFilter,
    categoryFilter,
    productFilter,
    startDate,
    endDate,
  ]);

  // Load the selected store's stock so shopkeepers can see availability while
  // composing (or editing) a request.
  useEffect(() => {
    if (!reqStoreId) {
      setStoreProducts([]);
      setStoreStockMap({});
      return;
    }
    api
      .get(`/products?locationId=${reqStoreId}`)
      .then((res) => {
        setStoreProducts(res.data);
        const map: Record<number, number> = {};
        for (const p of res.data) {
          map[p.id] = p.inventory?.[0]?.quantity ?? 0;
        }
        setStoreStockMap(map);
      })
      .catch(() => setStoreProducts([]));
  }, [reqStoreId]);

  const handleCreateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const validItems = reqItems.filter((item) => item.productId);
      if (validItems.length === 0) {
        toast.error("Please add at least one product.");
        return;
      }
      const payload = {
        storeId: reqStoreId ? Number(reqStoreId) : undefined,
        items: validItems.map((item) => ({
          productId: Number(item.productId),
          quantityRequested: item.quantity ? Number(item.quantity) : undefined,
        })),
      };
      if (editingReq) {
        await api.put(`/requests/${editingReq.id}`, payload);
        toast.success("Request updated.");
      } else {
        await api.post("/requests", payload);
      }
      setShowReqModal(false);
      setEditingReq(null);
      setReqStoreId("");
      setReqItems([{ productId: "", quantity: "", categoryId: "" }]);
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to create request.");
    }
  };

  const handleScanAt = (index: number, sku: string) => {
    const product = products.find(
      (p: any) => p.sku.toLowerCase() === sku.toLowerCase(),
    );
    if (!product) {
      toast.error(`No product found for "${sku}"`);
      return;
    }
    if (reqItems.some((i) => i.productId === String(product.id))) {
      toast.error(
        `${product.brand} ${product.baseName} is already in the request`,
      );
      return;
    }
    setReqItems((prev) =>
      prev.map((item, i) =>
        i === index
          ? {
              ...item,
              productId: String(product.id),
              categoryId: product.categoryId ? String(product.categoryId) : "",
            }
          : item,
      ),
    );
  };
  // Manage Modal - Owner store/restock data
  const [ownerStoreData, setOwnerStoreData] = useState<
    {
      id: number;
      status: string;
      quantityStored: number;
      newBuyPrice: number;
      newSellPrice: number;
    }[]
  >([]);

  const openManageModal = (req: any) => {
    setSelectedReq(req);
    setItemUpdates(req.items.map((i: any) => ({ id: i.id, status: i.status })));
    setDispatchData(
      req.items.map((i: any) => ({
        id: i.id,
        quantityDispatched: Math.max(
          0,
          (i.quantityRequested ?? 1) - i.quantityDispatched,
        ),
      })),
    );
    setOwnerStoreData(
      req.items.map((i: any) => ({
        id: i.id,
        status: i.status,
        quantityStored: i.quantityStored || (i.quantityRequested ?? 1),
        newBuyPrice: i.product?.currentBuyPrice || 0,
        newSellPrice: i.product?.currentSellPrice || 0,
      })),
    );
    setReceivedData(
      req.items.map((i: any) => ({
        id: i.id,
        quantityReceived:
          req.requestType === "STORE_TO_OWNER"
            ? i.quantityStored || 0
            : i.quantityDispatched || 0,
      })),
    );
  };

  const handleSaveApprovals = async () => {
    try {
      const changed = itemUpdates.filter(
        (u) =>
          u.status !==
          selectedReq?.items.find((i: any) => i.id === u.id)?.status,
      );
      if (changed.length === 0) {
        toast.error("No changes made.");
        return;
      }
      await api.patch(`/requests/${selectedReq.id}/items`, {
        items: changed,
      });
      setSelectedReq(null);
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to update approvals.");
    }
  };

  const handleDispatch = async () => {
    try {
      await api.post(`/requests/${selectedReq.id}/dispatch`, {
        items: dispatchData,
      });
      setSelectedReq(null);
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(
        err.response?.data?.message ||
          "Failed to dispatch items. Check stock levels.",
      );
    }
  };

  const canConfirmReceipt = (req: any) => {
    if (!req) return false;
    if (req.requestType === "STORE_TO_OWNER") {
      return user?.locationType === "STORE" && user?.locationId === req.storeId;
    }
    return req.createdById === user?.id;
  };

  const handleConfirmReceipt = async () => {
    if (!selectedReq) return;
    const expected =
      selectedReq.requestType === "STORE_TO_OWNER" ? "STORED" : "DISPATCHED";
    const confirmable = selectedReq.items.filter(
      (i: any) => i.status === expected,
    );
    if (confirmable.length === 0) {
      toast.error("No items ready for confirmation.");
      return;
    }
    const items = confirmable.map((i: any) => {
      const r = receivedData.find((d) => d.id === i.id);
      const qty = r ? Number(r.quantityReceived) : 0;
      return { id: i.id, ...(qty > 0 ? { quantityReceived: qty } : {}) };
    });
    try {
      await api.post(`/requests/${selectedReq.id}/confirm-receipt`, { items });
      toast.success("Receipt confirmed!");
      fetchRequests();
      setSelectedReq(null);
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Confirmation failed.");
    }
  };

  // True once any item has been dispatched/stored/received, at which point the
  // request can no longer be edited or sent back.
  const isProgressed = (req: any) =>
    req?.items?.some(
      (i: any) =>
        i.quantityDispatched > 0 ||
        i.quantityStored > 0 ||
        ["DISPATCHED", "STORED", "RECEIVED", "PARTIALLY_RECEIVED"].includes(
          i.status,
        ),
    );

  const canEditRequest = (req: any) => {
    if (!req || req.status === "CLOSED") return false;
    if (!(req.createdById === user?.id || user?.isSuperuser)) return false;
    return !isProgressed(req);
  };

  // The owner can delete a request in any status; the creator can only delete
  // requests that haven't started dispatching or been closed.
  const canDeleteRequest = (req: any) => {
    if (!req) return false;
    if (!(req.createdById === user?.id || user?.isSuperuser)) return false;
    if (user?.isSuperuser) return true;
    if (req.status === "CLOSED") return false;
    return !isProgressed(req);
  };

  const canSendBack = (req: any) => {
    if (!req || req.requestType === "STORE_TO_OWNER") return false;
    if (req.status === "CLOSED" || isProgressed(req)) return false;
    const dispatchLocationId =
      req.requestType === "STORE_TO_STORE" ? req.fromStoreId : req.storeId;
    const isDispatcher =
      user?.locationType === "STORE" && user?.locationId === dispatchLocationId;
    return Boolean(user?.isSuperuser || isDispatcher);
  };

  const openEditModal = (req: any) => {
    setEditingReq(req);
    setReqStoreId(
      req.requestType === "SHOP_TO_STORE" ? String(req.storeId ?? "") : "",
    );
    setReqItems(
      req.items.map((i: any) => ({
        productId: String(i.productId),
        quantity: i.quantityRequested ?? "",
        categoryId: i.product?.categoryId ? String(i.product.categoryId) : "",
      })),
    );
    setShowReqModal(true);
  };

  const handleSendBack = async (req: any) => {
    const ok = await confirm(
      "Send this request back to the creator to re-arrange the quantities?",
    );
    if (!ok) return;
    try {
      await api.post(`/requests/${req.id}/send-back`);
      toast.success("Request sent back to the creator.");
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(
        err.response?.data?.message || "Failed to send request back.",
      );
    }
  };

  const handleDeleteRequest = async (req: any) => {
    const ok = await confirm(
      `Delete request #${req.id}? This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await api.delete(`/requests/${req.id}`);
      toast.success(`Request #${req.id} deleted.`);
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to delete request.");
    }
  };

  // Direction labels for the From/To columns and the type badge. From = the
  // origin (an owner-created restock shows the Owner as origin), To = the
  // destination.
  const fromLabel = (r: any) =>
    r.requestType === "STORE_TO_OWNER"
      ? r.createdByIsOwner
        ? "Owner"
        : r.store?.name
      : r.requestType === "STORE_TO_STORE"
        ? (r.fromStore?.name ?? r.store?.name)
        : r.shop?.name || "—";
  const toLabel = (r: any) =>
    r.requestType === "STORE_TO_OWNER"
      ? r.createdByIsOwner
        ? r.store?.name || "—"
        : "Owner"
      : r.requestType === "STORE_TO_STORE"
        ? r.fromStore?.name
          ? r.store?.name
          : "—"
        : r.store?.name || "—";
  const typeLabel = (r: any) =>
    r.requestType === "STORE_TO_OWNER"
      ? r.createdByIsOwner
        ? "Owner → Store"
        : "Store → Owner"
      : r.requestType === "STORE_TO_STORE"
        ? "Store → Store"
        : "Shop → Store";

  // Who performs the next action — shown as a caption under the request status.
  const nextActorForRequest = (r: any) => {
    switch (r.status) {
      case "PENDING":
      case "PARTIALLY_APPROVED":
        return "Next: owner to approve";
      case "APPROVED":
        return r.requestType === "STORE_TO_STORE"
          ? "Next: source store to dispatch"
          : "Next: store to dispatch";
      case "PARTIALLY_DISPATCHED":
        return r.requestType === "STORE_TO_STORE"
          ? "Next: source store to finish dispatch"
          : "Next: store to dispatch remaining";
      case "AWAITING_CONFIRMATION":
      case "COMPLETED":
        return r.requestType === "STORE_TO_OWNER"
          ? "Next: store to confirm receipt"
          : r.requestType === "STORE_TO_STORE"
            ? "Next: receiving store to confirm receipt"
            : "Next: shop to confirm receipt";
      case "REJECTED":
        return "Rejected — edit or delete";
      case "CLOSED":
        return "Closed";
      default:
        return "";
    }
  };

  // Who performs the next action for a single request item (manage modal).
  const nextActorForItem = (r: any, item: any) => {
    switch (item.status) {
      case "PENDING":
        return r.requestType === "STORE_TO_OWNER"
          ? "Next: owner to store/reject"
          : "Next: owner to approve";
      case "APPROVED":
        return r.requestType === "STORE_TO_STORE"
          ? "Next: source store to dispatch"
          : "Next: store to dispatch";
      case "STORED":
        return "Next: store to confirm receipt";
      case "DISPATCHED":
        return r.requestType === "STORE_TO_STORE"
          ? "Next: receiving store to confirm"
          : "Next: shop to confirm receipt";
      case "REJECTED":
        return "Rejected";
      case "RECEIVED":
        return "Received";
      case "PARTIALLY_RECEIVED":
        return "Shortage — review";
      default:
        return "";
    }
  };

  const statuses = [
    "PENDING",
    "PARTIALLY_APPROVED",
    "APPROVED",
    "REJECTED",
    "PARTIALLY_DISPATCHED",
    "COMPLETED",
    "AWAITING_CONFIRMATION",
    "CLOSED",
  ];

  if (loading) return <Loading className="py-24" />;

  return (
    <div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800">
          Stock Requests
        </h1>
        {hasPermission("requests.create") && (
          <button
            onClick={() => setShowReqModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg whitespace-nowrap"
          >
            + New Request
          </button>
        )}
      </div>

      {/* Global Filters */}
      <FilterRow>
        <FilterField label="Status">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border p-2 rounded-lg w-full bg-white text-sm"
          >
            <option value="">All</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </FilterField>

        {user?.isSuperuser && (
          <FilterField label="Location">
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="border p-2 rounded-lg w-full bg-white text-sm"
            >
              <option value="">All</option>
              {locations.map((l: any) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </FilterField>
        )}

        <FilterField label="Category">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border p-2 rounded-lg w-full bg-white text-sm"
          >
            <option value="">All</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Product">
          <select
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
            className="border p-2 rounded-lg w-full bg-white text-sm"
          >
            <option value="">All</option>
            {products.map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.brand} {p.baseName}
              </option>
            ))}
          </select>
        </FilterField>

        <FilterField label="Start Date">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border p-2 rounded-lg w-full text-sm"
          />
        </FilterField>

        <FilterField label="End Date">
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border p-2 rounded-lg w-full text-sm"
          />
        </FilterField>
      </FilterRow>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-left min-w-[600px] sm:min-w-[700px] text-xs sm:text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-2 sm:p-3 md:p-4">ID</th>
              <th className="p-2 sm:p-3 md:p-4">Type</th>
              <th className="p-2 sm:p-3 md:p-4">From</th>
              <th className="p-2 sm:p-3 md:p-4">To</th>
              <th className="p-2 sm:p-3 md:p-4">
                <span className="block">Items Summary</span>
                <span className="mt-0.5 flex text-[10px] uppercase font-medium text-gray-400">
                  <span className="flex-1 text-center">Name</span>
                  <span className="w-10 text-center">Qty</span>
                </span>
              </th>
              <th className="p-2 sm:p-3 md:p-4">Status</th>
              <th className="p-2 sm:p-3 md:p-4">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r: any) => (
              <tr key={r.id} className="border-b hover:bg-gray-50">
                <td className="p-2 sm:p-3 md:p-4 font-medium">#{r.id}</td>
                <td className="p-2 sm:p-3 md:p-4">
                  <span
                    className={`px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-full font-semibold ${
                      r.requestType === "STORE_TO_OWNER"
                        ? "bg-purple-100 text-purple-800"
                        : r.requestType === "STORE_TO_STORE"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-indigo-100 text-indigo-800"
                    }`}
                  >
                    {typeLabel(r)}
                  </span>
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm font-medium">
                  {fromLabel(r)}
                  {r.createdByName && (
                    <div className="text-[10px] text-gray-400 font-normal">
                      {r.createdByName}
                    </div>
                  )}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-600">
                  {toLabel(r)}
                </td>
                <td className="p-2 sm:p-3 md:p-4 text-xs sm:text-sm text-gray-600">
                  <table className="w-full">
                    <tbody>
                      {r.items.map((i: any, idx: number) => (
                        <tr
                          key={idx}
                          className={idx > 0 ? "border-t border-gray-200" : ""}
                        >
                          <td className="py-1 pr-3 whitespace-nowrap">
                            {i.product?.baseName}
                          </td>
                          <td className="py-1 w-10 whitespace-nowrap text-gray-500">
                            {i.quantityRequested ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  <span
                    className={`px-1.5 sm:px-2 py-0.5 sm:py-1 text-[10px] sm:text-xs rounded-full font-semibold ${
                      r.status === "PENDING"
                        ? "bg-yellow-100 text-yellow-800"
                        : r.status === "AWAITING_CONFIRMATION"
                          ? "bg-orange-100 text-orange-800"
                          : r.status === "APPROVED" ||
                              r.status === "PARTIALLY_APPROVED"
                            ? "bg-blue-100 text-blue-800"
                            : r.status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : r.status === "CLOSED"
                                ? "bg-gray-100 text-gray-600"
                                : "bg-green-100 text-green-800"
                    }`}
                  >
                    {r.status === "AWAITING_CONFIRMATION"
                      ? "Confirmation Pending"
                      : r.status.replace(/_/g, " ")}
                  </span>
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    {nextActorForRequest(r)}
                  </div>
                </td>
                <td className="p-2 sm:p-3 md:p-4">
                  <RowActionsMenu
                    items={[
                      { label: "Manage", onClick: () => openManageModal(r) },
                      ...(canEditRequest(r)
                        ? [{ label: "Edit", onClick: () => openEditModal(r) }]
                        : []),
                      ...(canSendBack(r)
                        ? [
                            {
                              label: "Send Back",
                              onClick: () => handleSendBack(r),
                              color: "text-amber-600",
                            },
                          ]
                        : []),
                      ...(canDeleteRequest(r)
                        ? [
                            {
                              label: "Delete",
                              onClick: () => handleDeleteRequest(r),
                              color: "text-red-500",
                            },
                          ]
                        : []),
                    ]}
                  />
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  className="p-4 text-center text-gray-500 text-xs sm:text-sm"
                >
                  No requests found for the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Manage Request Modal */}
      <Modal
        isOpen={!!selectedReq}
        onClose={() => setSelectedReq(null)}
        title={`Manage Request #${selectedReq?.id}`}
      >
        <div className="space-y-4">
          {selectedReq?.items.map((item: any) => {
            const update = itemUpdates.find((u) => u.id === item.id);
            const dispatch = dispatchData.find((d) => d.id === item.id);
            const storeData = ownerStoreData.find((d) => d.id === item.id);
            const isStoreToOwner =
              selectedReq?.requestType === "STORE_TO_OWNER";
            const isClosed = selectedReq?.status === "CLOSED";

            return (
              <div
                key={item.id}
                className="border p-4 rounded-lg flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div>
                  <p className="font-semibold">
                    {item.product?.brand} {item.product?.baseName}
                  </p>
                  <p className="text-sm text-gray-500">
                    Requested: {item.quantityRequested ?? "—"}
                    {isStoreToOwner
                      ? ` | Stored: ${item.quantityStored || 0}`
                      : ` | Dispatched: ${item.quantityDispatched || 0}`}
                  </p>
                  <p className="flex items-center gap-2 text-xs text-gray-500">
                    Status:
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        item.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-800"
                          : item.status === "APPROVED"
                            ? "bg-blue-100 text-blue-800"
                            : item.status === "REJECTED"
                              ? "bg-red-100 text-red-800"
                              : item.status === "DISPATCHED"
                                ? "bg-indigo-100 text-indigo-800"
                                : item.status === "STORED"
                                  ? "bg-purple-100 text-purple-800"
                                  : item.status === "PARTIALLY_RECEIVED"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-green-100 text-green-800"
                      }`}
                    >
                      {item.status.replace(/_/g, " ")}
                    </span>
                    {item.confirmedAt
                      ? `· Confirmed: ${new Date(item.confirmedAt).toLocaleDateString()}`
                      : ""}
                  </p>
                  {(item.status === "RECEIVED" ||
                    item.status === "PARTIALLY_RECEIVED") && (
                    <p className="text-xs text-gray-500 mt-0.5">
                      Received: {item.quantityReceived ?? 0}
                      {item.status === "PARTIALLY_RECEIVED" &&
                        ` (short by ${
                          (isStoreToOwner
                            ? item.quantityStored || 0
                            : item.quantityDispatched || 0) -
                          (item.quantityReceived ?? 0)
                        })`}
                    </p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-1">
                    {nextActorForItem(selectedReq, item)}
                  </p>
                </div>

                {/* Owner - Shop→Store: Approve/Reject */}
                {!isClosed && user?.isSuperuser && !isStoreToOwner && (
                  <select
                    value={update?.status || item.status}
                    onChange={(e) =>
                      setItemUpdates(
                        itemUpdates.map((u) =>
                          u.id === item.id
                            ? { ...u, status: e.target.value }
                            : u,
                        ),
                      )
                    }
                    className="border p-2 rounded-lg bg-white"
                    disabled={[
                      "DISPATCHED",
                      "STORED",
                      "RECEIVED",
                      "PARTIALLY_RECEIVED",
                    ].includes(item.status)}
                  >
                    <option value="PENDING">Pending</option>
                    <option value="APPROVED">Approve</option>
                    <option value="REJECTED">Reject</option>
                  </select>
                )}

                {/* Owner - Store→Owner: Store/Reject with qty + prices */}
                {!isClosed &&
                  user?.isSuperuser &&
                  isStoreToOwner &&
                  selectedReq?.createdById !== user?.id && (
                    <div className="flex flex-col gap-2">
                      <select
                        value={storeData?.status || item.status}
                        onChange={(e) =>
                          setOwnerStoreData(
                            ownerStoreData.map((d) =>
                              d.id === item.id
                                ? { ...d, status: e.target.value }
                                : d,
                            ),
                          )
                        }
                        className="border p-2 rounded-lg bg-white"
                        disabled={[
                          "DISPATCHED",
                          "STORED",
                          "RECEIVED",
                          "PARTIALLY_RECEIVED",
                        ].includes(item.status)}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="STORED">Store</option>
                        <option value="REJECTED">Reject</option>
                      </select>
                      {(storeData?.status === "STORED" ||
                        item.status === "STORED") && (
                        <>
                          <input
                            type="number"
                            min="0"
                            placeholder="Qty Stored"
                            value={storeData?.quantityStored ?? 0}
                            onChange={(e) =>
                              setOwnerStoreData(
                                ownerStoreData.map((d) =>
                                  d.id === item.id
                                    ? {
                                        ...d,
                                        quantityStored: Number(e.target.value),
                                      }
                                    : d,
                                ),
                              )
                            }
                            className="border p-1 rounded w-24 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Buy Price"
                            value={storeData?.newBuyPrice ?? 0}
                            onChange={(e) =>
                              setOwnerStoreData(
                                ownerStoreData.map((d) =>
                                  d.id === item.id
                                    ? {
                                        ...d,
                                        newBuyPrice: Number(e.target.value),
                                      }
                                    : d,
                                ),
                              )
                            }
                            className="border p-1 rounded w-24 text-sm"
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="Sell Price"
                            value={storeData?.newSellPrice ?? 0}
                            onChange={(e) =>
                              setOwnerStoreData(
                                ownerStoreData.map((d) =>
                                  d.id === item.id
                                    ? {
                                        ...d,
                                        newSellPrice: Number(e.target.value),
                                      }
                                    : d,
                                ),
                              )
                            }
                            className="border p-1 rounded w-24 text-sm"
                          />
                        </>
                      )}
                    </div>
                  )}

                {/* Storekeeper - Shop→Store: Dispatch */}
                {!isClosed &&
                  user?.locationType === "STORE" &&
                  item.status === "APPROVED" &&
                  !isStoreToOwner && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Dispatch Qty:</span>
                      <input
                        type="number"
                        min="0"
                        value={dispatch?.quantityDispatched || 0}
                        onChange={(e) =>
                          setDispatchData(
                            dispatchData.map((d) =>
                              d.id === item.id
                                ? {
                                    ...d,
                                    quantityDispatched: Number(e.target.value),
                                  }
                                : d,
                            ),
                          )
                        }
                        className="border p-2 rounded-lg w-24"
                      />
                    </div>
                  )}

                {/* Receiving party confirms — enter actual received qty */}
                {!isClosed &&
                  canConfirmReceipt(selectedReq) &&
                  (isStoreToOwner
                    ? item.status === "STORED"
                    : item.status === "DISPATCHED") && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Received Qty:</span>
                      <input
                        type="number"
                        min="1"
                        value={
                          receivedData.find((d) => d.id === item.id)
                            ?.quantityReceived ?? 0
                        }
                        onChange={(e) =>
                          setReceivedData(
                            receivedData.map((d) =>
                              d.id === item.id
                                ? {
                                    ...d,
                                    quantityReceived: Number(e.target.value),
                                  }
                                : d,
                            ),
                          )
                        }
                        className="border p-2 rounded-lg w-24"
                      />
                      {(() => {
                        const expectedQty = isStoreToOwner
                          ? item.quantityStored || 0
                          : item.quantityDispatched || 0;
                        const enteredQty =
                          receivedData.find((d) => d.id === item.id)
                            ?.quantityReceived ?? 0;
                        return enteredQty > 0 && enteredQty < expectedQty ? (
                          <p className="text-xs text-amber-600 mt-1">
                            Shortage of {expectedQty - enteredQty} — the
                            dispatcher will be notified.
                          </p>
                        ) : null;
                      })()}
                    </div>
                  )}
              </div>
            );
          })}

          <div className="mt-6 flex gap-2 flex-wrap">
            {user?.isSuperuser &&
              selectedReq?.requestType === "SHOP_TO_STORE" && (
                <button
                  onClick={handleSaveApprovals}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Save Approvals
                </button>
              )}
            {user?.isSuperuser &&
              selectedReq?.requestType === "STORE_TO_OWNER" &&
              selectedReq?.createdById !== user?.id && (
                <button
                  onClick={async () => {
                    if (!selectedReq) return;
                    try {
                      await api.patch(`/requests/${selectedReq.id}/items`, {
                        items: ownerStoreData.map((d) => ({
                          id: d.id,
                          status: d.status,
                          quantityStored: d.quantityStored,
                          newBuyPrice: d.newBuyPrice,
                          newSellPrice: d.newSellPrice,
                        })),
                      });
                      toast.success("Items stored!");
                      fetchRequests();
                      setSelectedReq(null);
                    } catch (err: any) {
                      markHandled(err);
                      toast.error(err.response?.data?.message || "Failed.");
                    }
                  }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Save Store Actions
                </button>
              )}
            {user?.locationType === "STORE" &&
              selectedReq?.requestType === "SHOP_TO_STORE" && (
                <button
                  onClick={handleDispatch}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Dispatch Items
                </button>
              )}
            {canConfirmReceipt(selectedReq) &&
              selectedReq?.items.some((i: any) =>
                selectedReq.requestType === "STORE_TO_OWNER"
                  ? i.status === "STORED"
                  : i.status === "DISPATCHED",
              ) && (
                <button
                  onClick={handleConfirmReceipt}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Confirm Receipt
                </button>
              )}
            <button
              onClick={() => setSelectedReq(null)}
              className="bg-gray-200 px-4 py-2 rounded-lg"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>

      {/* Create New Request Modal */}
      <Modal
        isOpen={showReqModal}
        onClose={() => setShowReqModal(false)}
        title={
          editingReq
            ? `Edit Request #${editingReq.id}`
            : user?.locationType === "STORE"
              ? "Request Restock from Owner"
              : "Request Stock from Store"
        }
      >
        <form onSubmit={handleCreateRequest} className="grid grid-cols-1 gap-4">
          {/* Store selector — only for shopkeepers */}
          {user?.locationType !== "STORE" && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">
                Requesting From (Store)
              </label>
              <select
                value={reqStoreId}
                onChange={(e) => setReqStoreId(e.target.value)}
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
          )}
          {user?.locationType === "STORE" && (
            <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
              Requesting restock for your store location. The owner will review
              and restock.
            </p>
          )}

          {/* Dynamic items */}
          {reqItems.map((item, idx) => {
            const rowProducts = products.filter(
              (p: any) =>
                !item.categoryId || String(p.categoryId) === item.categoryId,
            );
            return (
              <div key={idx} className="border p-3 rounded-lg flex gap-2 ">
                <div className="w-40">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Category
                  </label>
                  <select
                    value={item.categoryId}
                    onChange={(e) => {
                      const newItems = [...reqItems];
                      newItems[idx] = {
                        ...newItems[idx],
                        categoryId: e.target.value,
                        productId: "",
                      };
                      setReqItems(newItems);
                    }}
                    className="border p-2 rounded-lg w-full bg-white text-sm"
                  >
                    <option value="">All</option>
                    {categories.map((c: any) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Product
                  </label>
                  <div className="flex gap-2">
                    <SearchableSelect
                      options={rowProducts.map((p: any) => ({
                        value: String(p.id),
                        label: `${p.brand} ${p.baseName}`,
                        searchText: `${p.brand} ${p.baseName} ${p.sku}`,
                        disabled: reqItems.some(
                          (r, i) => r.productId === String(p.id) && i !== idx,
                        ),
                      }))}
                      value={item.productId}
                      onChange={(v) => {
                        const newItems = [...reqItems];
                        newItems[idx].productId = v;
                        setReqItems(newItems);
                      }}
                      placeholder="Search product..."
                      className="flex-1"
                    />
                    <BarcodeScanner onScan={(sku) => handleScanAt(idx, sku)} />
                  </div>
                  {reqStoreId &&
                    storeStockMap[Number(item.productId)] !== undefined && (
                      <p
                        className={`text-[11px] mt-1 ${
                          storeStockMap[Number(item.productId)] <= 0
                            ? "text-red-500"
                            : "text-gray-500"
                        }`}
                      >
                        Available at store:{" "}
                        {storeStockMap[Number(item.productId)]}
                      </p>
                    )}
                </div>
                <div className="w-28">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Qty (optional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...reqItems];
                      newItems[idx].quantity = e.target.value;
                      setReqItems(newItems);
                    }}
                    className="border p-2 rounded-lg w-full"
                  />
                </div>
                {reqItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setReqItems(reqItems.filter((_, i) => i !== idx))
                    }
                    className="bg-red-100 text-red-600 px-2 py-2 rounded-lg text-sm"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setReqItems([
                  ...reqItems,
                  { productId: "", quantity: "", categoryId: "" },
                ])
              }
              className="flex-1 bg-gray-100 text-gray-700 p-2 rounded-lg text-sm border border-dashed"
            >
              + Add Another Item
            </button>
          </div>

          <button
            type="submit"
            className="bg-green-600 text-white p-2 rounded-lg mt-2 font-medium"
          >
            {editingReq ? "Update Request" : "Submit Request"}
          </button>
        </form>
      </Modal>
    </div>
  );
}
