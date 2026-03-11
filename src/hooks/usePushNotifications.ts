import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr.buffer as ArrayBuffer;
}

/**
 * Registers the service worker and subscribes the user to Web Push.
 * Call this hook once the user is authenticated.
 */
export function usePushNotifications(userId: string | null) {
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const didSubscribe = useRef(false);

  useEffect(() => {
    setSupported("serviceWorker" in navigator && "PushManager" in window);
    if ("Notification" in window) setPermission(Notification.permission);
  }, []);

  // Auto-subscribe once user is logged in and permission was previously granted
  useEffect(() => {
    if (!userId || !supported || didSubscribe.current) return;
    if (Notification.permission === "granted") {
      subscribe(userId);
    }
  }, [userId, supported]);

  const subscribe = async (uid?: string) => {
    const targetUid = uid ?? userId;
    if (!targetUid || !supported || !VAPID_PUBLIC_KEY) return false;
    if (didSubscribe.current) return true;

    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      // Request permission if needed
      if (Notification.permission !== "granted") {
        const result = await Notification.requestPermission();
        setPermission(result);
        if (result !== "granted") return false;
      }

      // Always unsubscribe first to ensure subscription uses the current VAPID key.
      // Reusing an old subscription tied to a different key causes 403 BadJwtToken.
      const existingSub = await registration.pushManager.getSubscription();
      if (existingSub) await existingSub.unsubscribe();

      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };

      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return false;

      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-push-subscription`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: subJson.keys,
            userAgent: navigator.userAgent,
          }),
        }
      );

      didSubscribe.current = true;
      setSubscribed(true);
      return true;
    } catch (err) {
      console.error("Push subscription error:", err);
      return false;
    }
  };

  const requestAndSubscribe = () => subscribe();

  return { supported, permission, subscribed, requestAndSubscribe };
}
