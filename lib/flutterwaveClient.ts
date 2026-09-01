import { createHmac, timingSafeEqual } from "node:crypto";

const FLUTTERWAVE_API_BASE = process.env.FLUTTERWAVE_API_BASE || "https://api.flutterwave.com/v3";

function getSecretKey(): string {
  const key = process.env.FLUTTERWAVE_SECRET_KEY;
  if (!key) throw new Error("Missing FLUTTERWAVE_SECRET_KEY environment variable");
  return key;
}

function getWebhookSecret(): string {
  const secret = process.env.FLUTTERWAVE_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing FLUTTERWAVE_WEBHOOK_SECRET environment variable");
  return secret;
}

async function flutterwaveFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${FLUTTERWAVE_API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${getSecretKey()}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    signal: options.signal ?? AbortSignal.timeout(15_000),
  });
  const payload = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || !payload) {
    throw new Error(`Flutterwave API error ${response.status}`);
  }
  return payload;
}

export type FlutterwaveCheckoutInput = {
  tx_ref: string;
  amount: number;
  currency: "NGN";
  redirect_url: string;
  payment_options: string;
  customer: {
    email: string;
    name: string;
  };
  customizations: {
    title: string;
    description: string;
  };
  meta: Record<string, string>;
  session_duration?: number;
  max_retry_attempt?: number;
  bank_transfer_options?: { expires: number };
};

export type FlutterwaveCheckoutResponse = {
  status: string;
  message: string;
  data: { link: string };
};

export type FlutterwaveVerifiedTransaction = {
  id: number;
  tx_ref: string;
  amount: number;
  currency: string;
  status: string;
  payment_type?: string;
  created_at?: string;
  customer?: { id?: number | string; email?: string };
};

export async function createFlutterwaveCheckout(
  input: FlutterwaveCheckoutInput,
): Promise<FlutterwaveCheckoutResponse> {
  const response = await flutterwaveFetch<FlutterwaveCheckoutResponse>("/payments", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (response.status !== "success" || !response.data?.link) {
    throw new Error("Flutterwave did not return a checkout URL");
  }
  return response;
}

export async function verifyFlutterwaveTransaction(
  transactionId: number,
): Promise<FlutterwaveVerifiedTransaction> {
  if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
    throw new Error("Invalid Flutterwave transaction ID");
  }
  const response = await flutterwaveFetch<{
    status: string;
    data: FlutterwaveVerifiedTransaction;
  }>(`/transactions/${transactionId}/verify`, { method: "GET" });
  if (response.status !== "success" || !response.data) {
    throw new Error("Flutterwave transaction verification failed");
  }
  return response.data;
}

export function verifyFlutterwaveWebhook(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", getWebhookSecret()).update(rawBody).digest("base64");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
