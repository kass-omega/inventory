"use client";
import Modal from "./Modal";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { useEffect, useState } from "react";

export default function ProductDetailModal({
  product,
  onClose,
}: {
  product: any;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    if (!product?.id) return;
    setDetail(null);
    api.get("/products/" + product.id)
      .then((res) => setDetail(res.data))
      .catch(() => setDetail(null));
  }, [product?.id]);

  const d = detail ?? product;
  const specs = (d?.attributes ?? {}) as Record<string, any>;
  const specEntries = Object.entries(specs);
  const inventory = detail?.inventory ?? product?.inventory ?? [];
  const totalStock = inventory.reduce(
    (s: number, i: any) => s + (i.quantity ?? 0),
    0,
  );
  const priceHistory = detail?.priceHistory ?? [];

  return (
    <Modal isOpen={!!product} onClose={onClose} title="Product Details">
      {d && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-gray-800">
                {d.brand} {d.baseName}
              </h3>
              <p className="text-sm text-gray-500">
                {d.category?.name ?? "No category"}
              </p>
              <p className="font-mono text-xs text-gray-400">{d.sku}</p>
            </div>
            <span
              className={
                "px-2 py-1 rounded-full text-xs font-bold " +
                (totalStock < 10 ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700")
              }
            >
              {totalStock} in stock
            </span>
          </div>

          <div>
            <h4 className="font-medium text-gray-700 mb-2">
              Specifications
            </h4>
            {specEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No specifications</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {specEntries.map(([k, v]) => (
                  <span
                    key={k}
                    className="bg-gray-100 px-2 py-1 rounded text-xs text-gray-700"
                  >
                    {k}: {String(v)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-medium text-gray-700 mb-2">QR Code</h4>
            <QRCodeSVG value={d.sku || ""} size={120} />
            <p className="font-mono text-xs mt-1 text-gray-500">{d.sku}</p>
          </div>

          <div>
            <h4 className="font-medium text-gray-700 mb-2">
              Stock by Location
            </h4>
            {inventory.length === 0 ? (
              <p className="text-sm text-gray-400">No inventory records</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-1">Location</th>
                    <th className="text-right p-1">Qty</th>
                  </tr>
                </thead>
                <tbody>
                  {inventory.map((i: any) => (
                    <tr key={i.id} className="border-t">
                      <td className="p-1">
                        {i.location?.name ?? "—"}
                      </td>
                      <td className="p-1 text-right font-semibold">
                        {i.quantity}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {priceHistory.length > 0 && (
            <div>
              <h4 className="font-medium text-gray-700 mb-2">
                Price History
              </h4>
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="text-left p-1">Date</th>
                    <th className="text-right p-1">Old Buy</th>
                    <th className="text-right p-1">New Buy</th>
                    <th className="text-right p-1">Old Sell</th>
                    <th className="text-right p-1">New Sell</th>
                  </tr>
                </thead>
                <tbody>
                  {priceHistory.map((h: any) => (
                    <tr key={h.id} className="border-t">
                      <td className="p-1 text-xs">
                        {new Date(h.updatedAt).toLocaleDateString()}
                      </td>
                      <td className="p-1 text-right">{h.oldBuyPrice}</td>
                      <td className="p-1 text-right">{h.newBuyPrice}</td>
                      <td className="p-1 text-right">{h.oldSellPrice}</td>
                      <td className="p-1 text-right">{h.newSellPrice}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
