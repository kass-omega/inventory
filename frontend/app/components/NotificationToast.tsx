"use client";

import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useEffect, useState } from "react";

export default function NotificationToast() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      try {
        const res = await api.get("/notifications/unread-count");
        const count: number = res.data.count;
        setUnreadCount(count);
        if (count === 0) setDismissed(false);
      } catch (err) {
        console.error("Failed to fetch notification toast count:", err);
      }
    };

    fetch();
    const interval = setInterval(fetch, 30000);
    return () => clearInterval(interval);
  }, [user]);

  if (unreadCount === 0 || dismissed) return null;

  return (
    <div className="fixed top-2 right-2 left-2 sm:top-4 sm:right-4 sm:left-auto z-[100] max-w-sm">
      <div className="bg-amber-50 border border-amber-300 rounded-xl shadow-lg p-4 flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-amber-900">
            Low Stock Alert
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            You have {unreadCount} unread notification
            {unreadCount > 1 ? "s" : ""}. Check the bell icon for details.
          </p>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="flex-shrink-0 text-amber-400 hover:text-amber-600 text-lg leading-none"
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
}
