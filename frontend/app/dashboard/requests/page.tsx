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
import { formatDateTime } from "@/lib/datetime";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  // Status-change timeline for the open request detail.
  const [activities, setActivities] = useState<any[]>([]);

  // Direct sale ("Confirm Receipt & Sell") modal state.
  const [saleReq, setSaleReq] = useState<any>(null);
  const [saleItems, setSaleItems] = useState<
    {
      requestItemId: number;
      productId: number;
      quantity: number;
      quantityReceived: number;
      dispatched: number;
      unitSellPrice: number;
      suggestedPrice: number;
      name: string;
    }[]
  >([]);
  const [saleType, setSaleType] = useState<
    "FULLY_PAID" | "PARTIALLY_PAID" | "CREDITED"
  >("FULLY_PAID");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [newPaymentMethodName, setNewPaymentMethodName] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [saleNotes, setSaleNotes] = useState("");
  const [savingSale, setSavingSale] = useState(false);

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

  const fetchRequests = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const query = `status=${statusFilter}&locationId=${locationFilter}&categoryId=${categoryFilter}&productId=${productFilter}&startDate=${startDate}&endDate=${endDate}`;
      const res = await api.get(`/requests?${query}`);
      setRequests(res.data);
    } finally {
      if (!silent) setLoading(false);
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

  // Silent auto-refresh every 5s + on focus: keeps the list fresh without a
  // loading flash so it never interrupts what the user is doing.
  const fetchRef = useRef(fetchRequests);
  useEffect(() => {
    fetchRef.current = fetchRequests;
  }, [fetchRequests]);
  useEffect(() => {
    const id = setInterval(() => fetchRef.current(true), 5000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchRef.current(true);
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onVisibility);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  const openDetail = async (r: any) => {
    openManageModal(r);
    setActivities([]);
    try {
      const res = await api.get(`/requests/${r.id}`);
      setActivities(res.data.activities || []);
    } catch {
      setActivities([]);
    }
  };

  const openSellModal = (r: any) => {
    setSaleReq(r);
    setSaleType("FULLY_PAID");
    setPaidAmount("");
    setPaymentMethodId("");
    setCustomerId("");
    setSaleNotes("");
    setSaleItems(
      (r.items || [])
        .filter((i: any) => isConfirmableItem(r, i))
        .map((i: any) => {
          const outstanding = outstandingFor(r, i);
          return {
            requestItemId: i.id,
            productId: i.productId,
            quantity: outstanding,
            quantityReceived: outstanding,
            dispatched: i.quantityDispatched ?? 0,
            unitSellPrice: 0,
            suggestedPrice: i.product?.currentSellPrice ?? 0,
            name: `${i.product?.brand ?? ""} ${i.product?.baseName ?? ""}`.trim(),
          };
        }),
    );
    api
      .get("/payment-methods")
      .then((res) => setPaymentMethods(res.data))
      .catch(() => {});
    api
      .get("/customers")
      .then((res) => setCustomers(res.data))
      .catch(() => {});
  };

  const handleSubmitSale = async () => {
    if (!saleReq) return;
    const items = saleItems.filter(
      (i) => i.productId && (i.quantityReceived || 0) > 0,
    );
    if (items.length === 0) {
      toast.error("No received items to confirm.");
      return;
    }
    for (const i of items) {
      if (i.quantity < 0 || i.quantity > i.quantityReceived) {
        toast.error(`Cannot sell more than received for ${i.name || "an item"}.`);
        return;
      }
    }
    if (items.some((i) => i.quantity > 0 && !(i.unitSellPrice > 0))) {
      toast.error("Sell price is required for each item being sold.");
      return;
    }
    if (items.some((i) => !(i.unitSellPrice > 0))) {
      toast.error("Sell price is required for each item.");
      return;
    }
    if (
      (saleType === "FULLY_PAID" || saleType === "PARTIALLY_PAID") &&
      !paymentMethodId
    ) {
      toast.error("Payment method is required.");
      return;
    }
    if (
      (saleType === "PARTIALLY_PAID" || saleType === "CREDITED") &&
      !customerId
    ) {
      toast.error("Customer is required for credit or partial payments.");
      return;
    }
    setSavingSale(true);
    try {
      await api.post(`/requests/${saleReq.id}/confirm-sale`, {
        items: items.map((i) => ({
          id: i.requestItemId,
          quantity: i.quantity,
          quantityReceived: i.quantityReceived,
          unitSellPrice: i.unitSellPrice,
        })),
        saleType,
        ...(paidAmount ? { paidAmount: Number(paidAmount) } : {}),
        ...(paymentMethodId
          ? { paymentMethodId: Number(paymentMethodId) }
          : {}),
        ...(customerId ? { customerId: Number(customerId) } : {}),
        ...(saleNotes.trim() ? { notes: saleNotes.trim() } : {}),
      });
      toast.success(
        items.some((i) => i.quantity > 0)
          ? "Receipt confirmed and sale recorded!"
          : "Receipt confirmed!",
      );
      setSaleReq(null);
      setSelectedReq(null);
      fetchRequests();
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to record the sale.");
    } finally {
      setSavingSale(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    const name = newPaymentMethodName.trim();
    if (!name) return;
    try {
      const res = await api.post("/payment-methods", { name });
      setPaymentMethods((prev) => [...prev, res.data]);
      setPaymentMethodId(String(res.data.id));
      setNewPaymentMethodName("");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to add payment method.");
    }
  };

  const handleAddCustomer = async () => {
    const name = newCustomerName.trim();
    if (!name) return;
    try {
      const res = await api.post("/customers", {
        name,
        ...(newCustomerPhone.trim() ? { phone: newCustomerPhone.trim() } : {}),
      });
      setCustomers((prev) => [...prev, res.data]);
      setCustomerId(String(res.data.id));
      setNewCustomerName("");
      setNewCustomerPhone("");
    } catch (err: any) {
      markHandled(err);
      toast.error("Failed to add customer.");
    }
  };

  // Deep-link: /dashboard/requests?req=<id> opens that request's detail.
  const searchParams = useSearchParams();
  useEffect(() => {
    const id = searchParams.get("req");
    if (!id) return;
    api
      .get(`/requests/${id}`)
      .then((res) => {
        openManageModal(res.data);
        setActivities(res.data.activities || []);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

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
        quantityDispatched:
          req.requestType !== "STORE_TO_OWNER" && isDispatchableItem(req, i)
            ? remainingFor(req, i)
            : 0,
      })),
    );
    setOwnerStoreData(
      req.items.map((i: any) => ({
        id: i.id,
        status: i.status,
        quantityStored:
          req.requestType === "STORE_TO_OWNER" && isDispatchableItem(req, i)
            ? remainingFor(req, i)
            : i.quantityStored || 0,
        newBuyPrice: i.product?.currentBuyPrice || 0,
        newSellPrice: i.product?.currentSellPrice || 0,
      })),
    );
    setReceivedData(
      req.items.map((i: any) => ({
        id: i.id,
        quantityReceived: outstandingFor(req, i),
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
    const items = dispatchData.filter((d) => {
      const item = selectedReq?.items.find((i: any) => i.id === d.id);
      return d.quantityDispatched > 0 && isDispatchableItem(selectedReq, item);
    });
    for (const d of items) {
      const item = selectedReq?.items.find((i: any) => i.id === d.id);
      if (!item) continue;
      const name = (String(item.product?.brand ?? "") + " " + String(item.product?.baseName ?? "")).trim() || ("Item #" + item.id);
      const requested = item.quantityRequested ?? d.quantityDispatched;
      const already = item.quantityDispatched || 0;
      if (d.quantityDispatched < 1) {
        toast.error("Quantity must be at least 1 for " + name + ".");
        return;
      }
      if (already + d.quantityDispatched > requested) {
        toast.error("Cannot dispatch more than the requested amount (" + requested + ") for " + name + ".");
        return;
      }
    }
    if (items.length === 0) {
      toast.error("No approved items to dispatch.");
      return;
    }
    try {
      await api.post(`/requests/${selectedReq.id}/dispatch`, { items });
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
      // Receiving location user (storekeeper OR shop employee) confirms.
      return user?.locationId === req.storeId;
    }
    return req.createdById === user?.id;
  };

  // Keep-it-open: a request stays actionable until every item is fully
  // received. `outstanding` = sent but not yet confirmed; `remaining` = still
  // to be dispatched/stored.
  const outstandingFor = (req: any, item: any) => {
    const sent =
      req?.requestType === "STORE_TO_OWNER"
        ? item.quantityStored || 0
        : item.quantityDispatched || 0;
    return Math.max(0, sent - (item.quantityReceived || 0));
  };
  const remainingFor = (req: any, item: any) => {
    const sent =
      req?.requestType === "STORE_TO_OWNER"
        ? item.quantityStored || 0
        : item.quantityDispatched || 0;
    return Math.max(0, (item.quantityRequested ?? 0) - sent);
  };
  const isConfirmableItem = (req: any, item: any) =>
    ["APPROVED", "DISPATCHED", "STORED", "PARTIALLY_RECEIVED"].includes(
      item.status,
    ) && outstandingFor(req, item) > 0;
  const isDispatchableItem = (req: any, item: any) =>
    ["APPROVED", "DISPATCHED", "STORED", "PARTIALLY_RECEIVED"].includes(
      item.status,
    ) && remainingFor(req, item) > 0;

  const handleConfirmReceipt = async () => {
    if (!selectedReq) return;
    const confirmable = selectedReq.items.filter((i: any) =>
      isConfirmableItem(selectedReq, i),
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

  const handleCloseRequest = async () => {
    if (!selectedReq) return;
    if (
      !window.confirm(
        "Close this request? Any shortfall will be accepted and no further dispatches will be made.",
      )
    )
      return;
    try {
      await api.post(`/requests/${selectedReq.id}/close`);
      toast.success("Request closed.");
      fetchRequests();
      setSelectedReq(null);
    } catch (err: any) {
      markHandled(err);
      toast.error(err.response?.data?.message || "Failed to close the request.");
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
  // A standalone-shop restock reuses the STORE_TO_OWNER pipeline with the shop
  // as the receiving location — label it as Shop rather than Store.
  const isShopTarget = (r: any) => r.store?.type === "SHOP";
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
        ? isShopTarget(r)
          ? "Owner → Shop"
          : "Owner → Store"
        : isShopTarget(r)
          ? "Shop → Owner"
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
        return r.requestType === "STORE_TO_OWNER"
          ? isShopTarget(r)
            ? "Next: shop to confirm receipt"
            : "Next: store to confirm receipt"
          : r.requestType === "STORE_TO_STORE"
            ? "Next: receiving store to confirm receipt"
            : "Next: shop to confirm receipt";
      case "COMPLETED":
        return "Completed";
      case "PARTIALLY_RECEIVED":
        return r.requestType === "STORE_TO_OWNER"
          ? "Next: owner to store remaining"
          : r.requestType === "STORE_TO_STORE"
            ? "Next: source store to dispatch remaining"
            : "Next: store to dispatch remaining";
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
        return (item.quantityDispatched || 0) > 0
          ? "Partially dispatched — awaiting receipt or more dispatch"
          : r.requestType === "STORE_TO_STORE"
            ? "Next: source store to dispatch"
            : "Next: store to dispatch";
      case "STORED":
        return isShopTarget(r)
          ? "Next: shop to confirm receipt"
          : "Next: store to confirm receipt";
      case "DISPATCHED":
        return r.requestType === "STORE_TO_STORE"
          ? "Next: receiving store to confirm"
          : "Next: shop to confirm receipt";
      case "REJECTED":
        return "Rejected";
      case "RECEIVED":
        return "Received";
      case "PARTIALLY_RECEIVED":
        return "Partially received — more can be dispatched or confirmed";
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
    "PARTIALLY_RECEIVED",
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
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">ID</th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">Type</th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">From</th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">To</th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">
                <span className="block">Items Summary</span>
                <span className="mt-0.5 flex text-[10px] uppercase font-medium text-gray-400">
                  <span className="flex-1 text-center">Name</span>
                  <span className="w-10 text-center">Qty</span>
                </span>
              </th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">Status</th>
              <th className="p-2 sm:p-3 md:p-4 whitespace-nowrap">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((r: any) => (
              <tr
                key={r.id}
                onClick={() => openDetail(r)}
                className="border-b hover:bg-gray-50 cursor-pointer"
              >
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap font-medium">#{r.id}</td>
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap">
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
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap text-xs sm:text-sm font-medium">
                  {fromLabel(r)}
                  {r.createdByName && (
                    <div className="text-[10px] text-gray-400 font-normal">
                      {r.createdByName}
                    </div>
                  )}
                </td>
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                  {toLabel(r)}
                </td>
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap text-xs sm:text-sm text-gray-600">
                  <table className="w-full">
                    <tbody>
                      {(r.items.length > 3 ? r.items.slice(0, 2) : r.items).map(
                        (i: any, idx: number) => (
                          <tr
                            key={idx}
                            className={
                              idx > 0 ? "border-t border-gray-200" : ""
                            }
                          >
                            <td className="py-1 pr-3 whitespace-nowrap">
                              {i.product?.baseName}
                            </td>
                            <td className="py-1 w-10 whitespace-nowrap text-gray-500">
                              {i.quantityRequested ?? i.quantityStored ?? "—"}
                            </td>
                          </tr>
                        ),
                      )}
                      {r.items.length > 3 && (
                        <tr className="border-t border-gray-200">
                          <td
                            colSpan={2}
                            className="py-1 text-blue-600 font-medium"
                          >
                            +{r.items.length - 2} more items
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </td>
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap">
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
                              : r.status === "PARTIALLY_RECEIVED"
                                ? "bg-amber-100 text-amber-800"
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
                <td className="p-2 sm:p-3 md:p-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
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

      {/* Manage / Detail Request Modal */}
      <Modal
        isOpen={!!selectedReq}
        onClose={() => setSelectedReq(null)}
        title={`Request #${selectedReq?.id}`}
      >
        <div className="space-y-4">
          {selectedReq && (
            <>
              {/* Request summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700 border-b pb-3">
                <div>
                  <span className="text-gray-400">Type:</span>{" "}
                  {typeLabel(selectedReq)}
                </div>
                <div>
                  <span className="text-gray-400">Status:</span>{" "}
                  <span className="font-medium">
                    {selectedReq.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">From:</span>{" "}
                  {fromLabel(selectedReq)}
                </div>
                <div>
                  <span className="text-gray-400">To:</span>{" "}
                  {toLabel(selectedReq)}
                </div>
                <div>
                  <span className="text-gray-400">Created by:</span>{" "}
                  {selectedReq.createdByName || "—"}
                </div>
                <div>
                  <span className="text-gray-400">Created at:</span>{" "}
                  {formatDateTime(selectedReq.createdAt)}
                </div>
              </div>

              {/* All items */}
              <div>
                <p className="text-sm font-semibold text-gray-600 mb-1">
                  Items ({selectedReq.items.length})
                </p>
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="p-2 text-left">Product</th>
                        <th className="p-2 text-right whitespace-nowrap">Requested</th>
                        <th className="p-2 text-right whitespace-nowrap">Dispatched</th>
                        <th className="p-2 text-right whitespace-nowrap">Stored</th>
                        <th className="p-2 text-right whitespace-nowrap">Received</th>
                        <th className="p-2 text-left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReq.items.map((item: any) => (
                        <tr key={item.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">
                            {item.product?.brand} {item.product?.baseName}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {item.quantityRequested ?? "—"}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {item.quantityDispatched ?? 0}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {item.quantityStored ?? 0}
                          </td>
                          <td className="p-2 text-right whitespace-nowrap">
                            {item.quantityReceived ?? 0}
                          </td>
                          <td className="p-2 whitespace-nowrap">
                            {item.status.replace(/_/g, " ")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Status-change timeline */}
              {activities.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-600 mb-1">
                    Status History
                  </p>
                  <div className="space-y-2">
                    {activities.map((a: any) => (
                      <div
                        key={a.id}
                        className="flex items-start gap-2 text-xs"
                      >
                        <span className="mt-0.5 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-gray-800">
                            <span className="font-medium">
                              {a.action.replace(/_/g, " ")}
                            </span>
                            {a.details ? ` — ${a.details}` : ""}
                          </p>
                          <p className="text-gray-400">
                            {a.actorName || "—"} · {formatDateTime(a.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
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
                        value={
                          item.status === "STORED" ||
                          item.status === "PARTIALLY_RECEIVED"
                            ? "STORED"
                            : storeData?.status || item.status
                        }
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
                        disabled={["RECEIVED", "SOLD"].includes(item.status)}
                      >
                        <option value="PENDING">Pending</option>
                        <option value="STORED">Store</option>
                        <option value="REJECTED">Reject</option>
                      </select>
                      {(storeData?.status === "STORED" ||
                        item.status === "STORED" ||
                        item.status === "PARTIALLY_RECEIVED") && (
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
                  isDispatchableItem(selectedReq, item) &&
                  !isStoreToOwner && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Dispatch Qty:</span>
                      <input
                        type="number"
                        min="1"
                        max={remainingFor(selectedReq, item)}
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
                  isConfirmableItem(selectedReq, item) && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm">Received Qty:</span>
                      <input
                        type="number"
                        min="1"
                        max={outstandingFor(selectedReq, item)}
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
                        const expectedQty = outstandingFor(selectedReq, item);
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
                  Save Approval Actions
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
              selectedReq?.requestType === "SHOP_TO_STORE" &&
              selectedReq?.items.some((i: any) =>
                isConfirmableItem(selectedReq, i),
              ) && (
                <button
                  onClick={() => openSellModal(selectedReq)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Confirm Receipt & Sell
                </button>
              )}
            {canConfirmReceipt(selectedReq) &&
              selectedReq?.items.some((i: any) =>
                isConfirmableItem(selectedReq, i),
              ) && (
                <button
                  onClick={handleConfirmReceipt}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Confirm Receipt
                </button>
              )}
            {canConfirmReceipt(selectedReq) &&
              selectedReq?.status !== "CLOSED" &&
              selectedReq?.items.some(
                (i: any) =>
                  isConfirmableItem(selectedReq, i) ||
                  isDispatchableItem(selectedReq, i),
              ) && (
                <button
                  onClick={handleCloseRequest}
                  className="bg-red-600 text-white px-4 py-2 rounded-lg flex-1"
                >
                  Close Request
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
              <div key={idx} className="border p-3 rounded-lg flex flex-col gap-2 sm:flex-row">
                <div className="sm:w-40">
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
                <div className="flex gap-2 items-start sm:flex-1">
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

      {/* Confirm Receipt & Sell — Direct Sale Modal */}
      <Modal
        isOpen={!!saleReq}
        onClose={() => setSaleReq(null)}
        title={`Sell from Request #${saleReq?.id}`}
      >
        <div className="space-y-4">
          {saleReq && (
            <>
              <p className="text-sm text-gray-500">
                Enter the quantity actually received and the quantity to sell
                now. Unsold received items stay in shop stock; shortages are
                reported to the dispatcher.
              </p>

              <div className="space-y-2">
                {saleItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">{item.name || "—"}</p>
                      <p className="text-[10px] text-gray-400">
                        Dispatched: {item.dispatched ?? 0}
                        {item.quantityReceived < (item.dispatched ?? 0)
                          ? ` · shortage ${(item.dispatched ?? 0) - item.quantityReceived}`
                          : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <label className="text-xs text-gray-500">Received</label>
                      <input
                        type="number"
                        min="1"
                        max={item.dispatched ?? 0}
                        value={item.quantityReceived}
                        onChange={(e) => {
                          const received = Math.min(
                            Number(e.target.value),
                            item.dispatched ?? 0,
                          );
                          const next = [...saleItems];
                          next[idx] = {
                            ...next[idx],
                            quantityReceived: received,
                            quantity: Math.min(next[idx].quantity, received),
                          };
                          setSaleItems(next);
                        }}
                        className="border p-1.5 rounded-lg w-20 text-sm"
                      />
                      <label className="text-xs text-gray-500">Sell</label>
                      <input
                        type="number"
                        min="0"
                        max={item.quantityReceived}
                        value={item.quantity}
                        onChange={(e) => {
                          const next = [...saleItems];
                          next[idx] = {
                            ...next[idx],
                            quantity: Number(e.target.value),
                          };
                          setSaleItems(next);
                        }}
                        className="border p-1.5 rounded-lg w-20 text-sm"
                      />
                      <label className="text-xs text-gray-500">Price</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.unitSellPrice === 0 ? "" : item.unitSellPrice}
                        onChange={(e) => {
                          const next = [...saleItems];
                          next[idx] = {
                            ...next[idx],
                            unitSellPrice: e.target.value === "" ? 0 : Number(e.target.value),
                          };
                          setSaleItems(next);
                        }}
                        placeholder={item.suggestedPrice
                          ? `${item.suggestedPrice.toFixed(2)} (default)`
                          : "0.00 (default)"}
                        className="border p-1.5 rounded-lg w-24 text-sm"
                      />
                    </div>
                  </div>
                ))}
                {saleItems.length === 0 && (
                  <p className="text-sm text-gray-400">
                    No items pending confirmation.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between border-t pt-2">
                <span className="text-sm font-medium text-gray-600">Total</span>
                <span className="text-lg font-bold text-gray-900">
                  {saleItems
                    .reduce((sum, i) => sum + (i.quantity || 0) * (i.unitSellPrice || 0), 0)
                    .toFixed(2)}{" "}
                  birr
                </span>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500 mb-1">
                  Sale Type
                </p>
                <div className="flex gap-2">
                  {(["FULLY_PAID", "PARTIALLY_PAID", "CREDITED"] as const).map(
                    (t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setSaleType(t)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                          saleType === t
                            ? "bg-blue-600 text-white border-blue-600"
                            : "bg-white text-gray-600 border-gray-300"
                        }`}
                      >
                        {t === "FULLY_PAID"
                          ? "Paid"
                          : t === "PARTIALLY_PAID"
                            ? "Partial"
                            : "Credit"}
                      </button>
                    ),
                  )}
                </div>
              </div>

              {(saleType === "FULLY_PAID" || saleType === "PARTIALLY_PAID") && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={paymentMethodId}
                    onChange={(e) => setPaymentMethodId(e.target.value)}
                    className="border p-2 rounded-lg w-full bg-white text-sm"
                  >
                    <option value="">Select</option>
                    {paymentMethods.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 mt-1">
                    <input
                      value={newPaymentMethodName}
                      onChange={(e) => setNewPaymentMethodName(e.target.value)}
                      placeholder="New payment method"
                      className="border p-2 rounded-lg flex-1 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddPaymentMethod}
                      className="bg-gray-200 px-3 rounded-lg text-sm"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {saleType === "PARTIALLY_PAID" && (
                <div>
                  <label className="block text-sm font-medium text-gray-500 mb-1">
                    Paid Amount
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="border p-2 rounded-lg w-full text-sm"
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-500">
                    Customer{" "}
                    {(saleType === "PARTIALLY_PAID" ||
                      saleType === "CREDITED") && (
                      <span className="text-red-500">*</span>
                    )}
                  </label>
                </div>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="border p-2 rounded-lg w-full bg-white text-sm"
                >
                  <option value="">Select customer</option>
                  {customers.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2 mt-1">
                  <input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="New customer name"
                    className="border p-2 rounded-lg flex-1 text-sm"
                  />
                  <input
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="border p-2 rounded-lg w-32 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomer}
                    className="bg-gray-200 px-3 rounded-lg text-sm"
                  >
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Notes
                </label>
                <textarea
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="border p-2 rounded-lg w-full text-sm"
                  rows={2}
                  placeholder="Optional"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSubmitSale}
                  disabled={savingSale || saleItems.length === 0}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingSale && <Loading size="sm" />}
                  {savingSale ? "Saving..." : "Confirm & Sell"}
                </button>
                <button
                  onClick={() => setSaleReq(null)}
                  className="bg-gray-200 px-4 py-2 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>

      </Modal>
    </div>
  );
}
