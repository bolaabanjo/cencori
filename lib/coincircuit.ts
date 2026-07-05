import { createHmac } from 'crypto';

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
  url?: string;
  successUrl?: string;
  cancelUrl?: string;
  state: 'open' | 'closed';
  type: 'checkout' | 'invoice';
  amount: string;
  currency: 'USD' | 'NGN';
  payment?: {
    status?: 'pending' | 'partial' | 'expired' | 'completed' | 'failed';
    asset?: string;
    chain?: string;
    amount?: string;
    amountReceived?: string;
    address?: string;
    conversionRate?: string;
  } | null;
  customer?: {
    id?: string;
    email: string;
    firstName?: string;
    lastName?: string;
  };
  metadata?: Record<string, string>;
  createdAt: string;
  expiresAt: string;
  completedAt?: string;
};

export type CoinCircuitWebhookEvent =
  | 'payment.completed'
  | 'payment.partial'
  | 'payment.expired'
  | 'payment.underpaid';

export type CoinCircuitWebhookPayload = {
  event: CoinCircuitWebhookEvent;
  data: {
    session: {
      id: string;
      reference: string;
      title?: string;
      description?: string;
      state: 'open' | 'closed';
      type: 'checkout' | 'invoice';
      amount: string;
      currency: 'USD' | 'NGN';
      settlements: {
        currency: 'USD' | 'NGN';
        gross: { amount: string; conversionRate: string };
        fees: {
          processing?: { amount: string; paidBy: 'customer' | 'merchant' };
          gas?: { amount: string; paidBy: 'customer' | 'merchant' };
        };
        net: { amount: string };
      };
      payment?: {
        status?: 'pending' | 'partial' | 'expired' | 'completed' | 'failed';
        asset?: string;
        chain?: string;
        amount?: string;
        amountReceived?: string;
        address?: string;
        conversionRate?: string;
      } | null;
      url?: string;
      cancelUrl?: string;
      successUrl?: string;
      customer?: {
        id?: string;
        email: string;
        firstName?: string;
        lastName?: string;
      };
      metadata?: Record<string, string>;
      createdAt: string;
      expiresAt: string;
      completedAt?: string;
      transaction?: {
        id: string;
        txHash: string;
        status: string;
        chain: string;
        asset: string;
        amount: string;
        toAddress: string;
        fromAddress: string;
        explorerUrl?: string;
        confirmations?: string;
      };
    };
    failureReason?: string | null;
  };
};

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
  amount: string;
  currency: 'USD' | 'NGN';
  customer: {
    email: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
  };
  metadata?: Record<string, string>;
  successUrl?: string;
  webhookUrl?: string;
}): Promise<CoinCircuitSessionResponse> {
  return coincircuitFetch<CoinCircuitSessionResponse>('/api/v1/payments', {
    method: 'POST',
    body: JSON.stringify({
      title: 'Cencori Credits Top-Up',
      description: 'Prepaid credits for AI gateway usage',
      amount: params.amount,
      currency: params.currency,
      customer: params.customer,
      metadata: params.metadata,
      successUrl: params.successUrl,
      webhookUrl: params.webhookUrl,
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
