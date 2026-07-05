import { createHmac } from 'crypto';
import { CoinCircuit, type components } from 'coincircuit';

type CreateCheckoutSessionDto = components['schemas']['CreateCheckoutSessionDto'];
type CheckoutSessionV2Dto = components['schemas']['CheckoutSessionV2Dto'];
type PaymentCompletedWebhookDto = components['schemas']['PaymentCompletedWebhookDto'];
type PaymentWebhookEnvelopeDto = components['schemas']['PaymentWebhookEnvelopeDto'];

const apiKey = process.env.COINCIRCUIT_API_KEY || '';
const webhookSecret = process.env.COINCIRCUIT_WEBHOOK_SECRET || '';

let client: CoinCircuit | null = null;

function getClient(): CoinCircuit {
  if (!client) {
    client = new CoinCircuit({
      apiKey,
      baseUrl: process.env.COINCIRCUIT_BASE_URL || 'https://api.coincircuit.io',
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return client;
}

export async function createPaymentSession(
  params: CreateCheckoutSessionDto
): Promise<CheckoutSessionV2Dto> {
  return getClient().payments.create(params);
}

export async function getPaymentSession(
  reference: string
): Promise<CheckoutSessionV2Dto> {
  return getClient().payments.get(reference);
}

export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  if (!webhookSecret) {
    console.error('[CoinCircuit] Missing webhook secret');
    return false;
  }

  if (!signatureHeader) {
    console.error('[CoinCircuit] Missing signature header');
    return false;
  }

  try {
    const hmac = createHmac('sha256', webhookSecret);
    hmac.update(rawBody);
    const computed = hmac.digest('hex');
    return computed === signatureHeader;
  } catch (err) {
    console.error('[CoinCircuit] HMAC verification error:', err);
    return false;
  }
}

export type CoinCircuitWebhookPayload = PaymentCompletedWebhookDto;
export type CoinCircuitWebhookEnvelope = PaymentWebhookEnvelopeDto;
export type CoinCircuitSessionResponse = CheckoutSessionV2Dto;
