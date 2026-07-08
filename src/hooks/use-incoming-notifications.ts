"use client";

import { useCallback, useEffect, useRef } from "react";

interface NotifyIncomingArgs {
  messageId: string;
  conversationId: string;
  senderType: string;
  contactName?: string | null;
  previewText?: string | null;
}

const LAST_NOTIFIED_MESSAGE_KEY = "wacrm:last-notified-message-id";

function hasNotificationSupport(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function useIncomingNotifications() {
  const audioContextRef = useRef<AudioContext | null>(null);
  const lastNotifiedMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      lastNotifiedMessageIdRef.current =
        localStorage.getItem(LAST_NOTIFIED_MESSAGE_KEY);
    } catch {
      // localStorage is best-effort only.
    }
  }, []);

  useEffect(() => {
    if (!hasNotificationSupport()) return;
    if (Notification.permission !== "default") return;

    const requestPermission = () => {
      void Notification.requestPermission();
      window.removeEventListener("pointerdown", requestPermission);
      window.removeEventListener("keydown", requestPermission);
    };

    window.addEventListener("pointerdown", requestPermission, { once: true });
    window.addEventListener("keydown", requestPermission, { once: true });

    return () => {
      window.removeEventListener("pointerdown", requestPermission);
      window.removeEventListener("keydown", requestPermission);
    };
  }, []);

  const playAlertSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioCtor =
      window.AudioContext ||
      // @ts-expect-error webkit fallback for Safari
      window.webkitAudioContext;
    if (!AudioCtor) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioCtor();
    }
    const ctx = audioContextRef.current;
    if (ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const burstOffsets = [0, 0.18, 0.36, 0.72];
    for (const offset of burstOffsets) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(1120, now + offset);
      gain.gain.setValueAtTime(0.0001, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.24, now + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.19);
    }
  }, []);

  const notifyIncomingMessage = useCallback(
    (args: NotifyIncomingArgs) => {
      if (args.senderType !== "customer") return;
      if (!args.messageId) return;
      if (lastNotifiedMessageIdRef.current === args.messageId) return;

      lastNotifiedMessageIdRef.current = args.messageId;
      try {
        localStorage.setItem(LAST_NOTIFIED_MESSAGE_KEY, args.messageId);
      } catch {
        // Ignore persistence failure.
      }

      playAlertSound();

      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([220, 120, 220, 120, 220]);
      }

      if (hasNotificationSupport() && Notification.permission === "granted") {
        const title = args.contactName?.trim()
          ? `New WhatsApp message from ${args.contactName}`
          : "New WhatsApp message";
        const body = args.previewText?.trim() || "Open Inbox to view the message.";
        const notification = new Notification(title, {
          body,
          tag: `conversation:${args.conversationId}`,
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
      }
    },
    [playAlertSound],
  );

  return { notifyIncomingMessage };
}
