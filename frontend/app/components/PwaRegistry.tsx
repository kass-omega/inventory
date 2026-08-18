"use client";

import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import { useEffect } from "react";

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

  // Register the service worker once (production only).
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") return;
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch((err) => console.error("Service worker registration failed:", err));
  }, []);

  // Subscribe to push once the user is logged in (associate with their id).
  useEffect(() => {
    if (!user) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (process.env.NODE_ENV !== "production") return;

    (async () => {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
        });
        await api.post("/push/subscribe", sub.toJSON());
      } catch (e) {
        console.error("Push subscription failed:", e);
      }
    })();
  }, [user]);

  return null;
}

