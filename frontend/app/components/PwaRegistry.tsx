"use client";

import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useCallback, useEffect, useRef, useState } from "react";

// Public VAPID key (must match the backend's VAPID_PUBLIC_KEY).
const VAPID_PUBLIC =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BJlyIPasYpzqihbUZwAvqWvjjqyGQ4xOd8NgbF1bWusj4fhue_YF-FH5XuWGVwadwaCeYPPtu1GKEVwCyA-sVK0";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const raw = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(raw);
  return new Uint8Array([...rawData].map((c) => c.charCodeAt(0)));
}

export default function PwaRegistry() {
  const { user } = useAuth();
  const [pushIssue, setPushIssue] = useState<string | null>(null);
  const subscribedOnce = useRef(false);

  // Register the service worker once (production only, unless explicitly enabled).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (
      process.env.NODE_ENV !== "production" &&
      !process.env.NEXT_PUBLIC_ENABLE_PUSH
    ) {
      console.info(
        "[push] Skipping service worker in development (set NEXT_PUBLIC_ENABLE_PUSH=true to test PWA/push locally).",
      );
      return;
    }
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("[push] Service worker registration failed:", err));
  }, []);

  const subscribeToPush = useCallback(async () => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      console.warn("[push] Push not supported in this browser.");
      return;
    }
    if (
      process.env.NODE_ENV !== "production" &&
      !process.env.NEXT_PUBLIC_ENABLE_PUSH
    ) {
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPushIssue("Notification permission was not granted.");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const res = await api.post("/push/subscribe", sub.toJSON());
      subscribedOnce.current = true;
      setPushIssue(null);
      console.info(
        `[push] Subscription active for user ${user.id} (status ${res.status}).`,
      );
    } catch (e: any) {
      console.error("[push] Push subscription failed:", e);
      setPushIssue(
        e?.message || "Push setup failed — check the browser console.",
      );
    }
  }, [user]);

  useEffect(() => {
    subscribeToPush();

    // Retry if the first attempt failed (e.g. transient), whenever the user
    // returns to the app or the page regains focus.
    const maybeRetry = () => {
      if (!subscribedOnce.current) subscribeToPush();
    };
    window.addEventListener("focus", maybeRetry);
    document.addEventListener("visibilitychange", maybeRetry);

    return () => {
      window.removeEventListener("focus", maybeRetry);
      document.removeEventListener("visibilitychange", maybeRetry);
    };
  }, [subscribeToPush]);

  // Auto-dismiss the diagnostic banner after a short while.
  useEffect(() => {
    if (!pushIssue) return;
    const t = setTimeout(() => setPushIssue(null), 10000);
    return () => clearTimeout(t);
  }, [pushIssue]);

  if (!pushIssue) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] bg-red-600 text-white text-xs sm:text-sm px-4 py-2 rounded-lg shadow-lg max-w-sm text-center">
      ⚠️ Push notifications unavailable: {pushIssue}
    </div>
  );
}

