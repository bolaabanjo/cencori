const COINCIRCUIT_BASE_URL = process.env.COINCIRCUIT_BASE_URL || 'https://api.coincircuit.io';
const COINCIRCUIT_API_KEY = process.env.COINCIRCUIT_API_KEY || '';
const COINCIRCUIT_WEBHOOK_SECRET = process.env.COINCIRCUIT_WEBHOOK_SECRET || '';

export const COINCIRCUIT_CONFIG = {
  apiKey: COINCIRCUIT_API_KEY,
  webhookSecret: COINCIRCUIT_WEBHOOK_SECRET,
  baseUrl: COINCIRCUIT_BASE_URL,
};

export type CoinCircuitSessionResponse = {
  id: string;
  reference: string;
  url: string;
  payment: {
    address?: string;
  } | null;
};

export type CoinCircuitWebhookEvent =
  | 'PaymentCompleted'
  | 'PaymentPartial'
  | 'PaymentExpired'
  | 'PaymentUnderpaid';

export type CoinCircuitWebhookPayload = {
  event: CoinCircuitWebhookEvent;
  data: {
    session: {
      id: string;
      reference: string;
      state: string;
      amount: string;
      currency: string;
      metadata?: Record<string, string>;
      settlements?: Array<{
        amount: string;
        asset: string;
        chain: string;
      }>;
      createdAt: string;
      expiresAt?: string;
      completedAt?: string;
      invoiceId?: string;
      refundStatus?: string;
      isRefunded?: boolean;
      transaction?: Record<string, unknown>;
    };
    failureReason?: string | null;
  };
};

import { createHmac } from 'crypto';

async function coincircuitFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${COINCIRCUIT_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': COINCIRCUIT_API_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CoinCircuit API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function createPaymentSession(params: {
  amount: number;
  currency: string;
  customer: {
    email: string;
    firstName?: string;
    lastName?: string;
  };
  metadata?: Record<string, string>;
}): Promise<CoinCircuitSessionResponse> {
  return coincircuitFetch<CoinCircuitSessionResponse>('/api/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      customer: params.customer,
      metadata: params.metadata,
    }),
  });
}

export async function getPaymentSession(
  reference: string
): Promise<CoinCircuitSessionResponse> {
  return coincircuitFetch<CoinCircuitSessionResponse>(
    `/api/v1/payments/reference/${reference}`
  );
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!COINCIRCUIT_WEBHOOK_SECRET) {
    console.error('[CoinCircuit] Missing webhook secret');
    return false;
  }

  if (!signatureHeader) {
    console.error('[CoinCircuit] Missing signature header');
    return false;
  }

  try {
    const hmac = createHmac('sha256', COINCIRCUIT_WEBHOOK_SECRET);
    hmac.update(rawBody);
    const computed = hmac.digest('hex');
    return computed === signatureHeader;
  } catch (err) {
    console.error('[CoinCircuit] HMAC verification error:', err);
    return false;
  }
}
