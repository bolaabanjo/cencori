"use client";

import type { ReactNode } from "react";
import { sileo, type SileoOptions, type SileoPosition } from "sileo";

type ToastMessage = ReactNode;

type ToastAction = {
  label: ReactNode;
  onClick: () => void;
};

type ToastOptions = {
  description?: ReactNode;
  duration?: number | null;
  icon?: ReactNode;
  position?: SileoPosition;
  action?: ToastAction;
};

function textFromNode(value: ReactNode, fallback: string) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
}

function optionsFromMessage(
  message: ToastMessage,
  options?: ToastOptions,
): SileoOptions {
  const messageIsText = typeof message === "string" || typeof message === "number";

  return {
    title: textFromNode(message, "Notification"),
    description: options?.description ?? (messageIsText ? undefined : message),
    duration: options?.duration,
    icon: options?.icon,
    position: options?.position,
    button: options?.action
      ? {
          title: textFromNode(options.action.label, "View"),
          onClick: options.action.onClick,
        }
      : undefined,
  };
}

function show(message: ToastMessage, options?: ToastOptions) {
  return sileo.show(optionsFromMessage(message, options));
}

export const toast = Object.assign(show, {
  success(message: ToastMessage, options?: ToastOptions) {
    return sileo.success(optionsFromMessage(message, options));
  },
  error(message: ToastMessage, options?: ToastOptions) {
    return sileo.error(optionsFromMessage(message, options));
  },
  warning(message: ToastMessage, options?: ToastOptions) {
    return sileo.warning(optionsFromMessage(message, options));
  },
  info(message: ToastMessage, options?: ToastOptions) {
    return sileo.info(optionsFromMessage(message, options));
  },
  loading(message: ToastMessage, options?: ToastOptions) {
    return sileo.show({
      ...optionsFromMessage(message, options),
      type: "loading",
      duration: null,
    });
  },
  dismiss(id?: string | number) {
    if (id === undefined) {
      sileo.clear();
      return;
    }

    sileo.dismiss(String(id));
  },
});

export type { ToastOptions };
