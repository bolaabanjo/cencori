import { createHmac, timingSafeEqual } from 'node:crypto';

const BACHS_API_BASE =
  process.env.BACHS_API_BASE ||
  (process.env.NODE_ENV === 'production'
    ? 'https://api.bachs.io/v1'
    : 'https://sandbox-api.bachs.io/v1');

function getApiKey(): string {
  const key = process.env.BACHS_API_KEY;
  if (!key) throw new Error('Missing BACHS_API_KEY environment variable');
  return key;
}

export function getWebhookSecret(): string {
  const secret = process.env.BACHS_WEBHOOK_SECRET;
  if (!secret) throw new Error('Missing BACHS_WEBHOOK_SECRET environment variable');
  return secret;
}

/* ─── Types ───────────────────────────────────────────────────────────── */

export type BachsProductType = 'subscription' | 'credits_topup' | 'scan_subscription';
export type SubscriptionTier = 'pro' | 'team';
export type BillingInterval = 'month' | 'year';

export interface BachsCustomerInput {
  email: string;
  name?: string;
}

export interface BachsProductCartItem {
  product_id: string;
  quantity: number;
}

export interface CreateCheckoutSessionInput {
  product_cart: BachsProductCartItem[];
  customer: BachsCustomerInput;
  return_url: string;
  cancel_url: string;
  metadata?: Record<string, string>;
}

export interface BachsCheckoutSession {
  checkout_id: string;
  checkout_url: string;
  status: string;
  expires_at: string;
  created_at: string;
  embed_code?: string;
}

export interface BachsCustomer {
  id: string;
  email: string;
  name?: string;
  created_at: string;
}

export interface BachsCharge {
  charge_id: string;
  checkout_id: string;
  reference: string;
  status: string;
  amount: string;
  currency: string;
  settlement_amount?: string;
  settlement_currency?: string;
  payment_method?: string;
  processing_fee?: string;
  customer: BachsCustomer;
  product_cart: BachsProductCartItem[];
  metadata: Record<string, string>;
  created_at: string;
}

export interface BachsWebhookEvent {
  id: string;
  type:
    | 'collection.succeeded'
    | 'collection.failed'
    | 'collection.abandoned'
    | 'collection.underpaid';
  created_at: string;
  organization_id: string;
  data: {
    charge_id: string;
    checkout_id: string;
    reference: string;
    status: string;
    amount: string;
    currency: string;
    settlement_amount?: string;
    settlement_currency?: string;
    payment_method?: string;
    processing_fee?: string;
    product_cart: BachsProductCartItem[];
    customer: BachsCustomer;
    metadata: Record<string, string>;
    reason?: string;
  };
}

export interface BachsPayin {
  id: string;
  charge_id?: string;
  amount: string;
  currency: string;
  status: string;
  customer: BachsCustomer;
  product_cart?: BachsProductCartItem[];
  metadata?: Record<string, string>;
  created_at: string;
}

export interface BachsPayinResponse {
  payins: BachsPayin[];
  total_count: number;
  page: number;
  per_page: number;
}

/* ─── API Client ──────────────────────────────────────────────────────── */

async function bachsFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${BACHS_API_BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bachs API error ${res.status}${body ? `: ${body}` : ''}`);
  }
  return res.json();
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<BachsCheckoutSession> {
  return bachsFetch<BachsCheckoutSession>('/checkout-sessions', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCheckoutSession(
  checkoutId: string
): Promise<BachsCheckoutSession> {
  return bachsFetch<BachsCheckoutSession>(`/checkout-sessions/${checkoutId}`);
}

export async function createCustomer(
  input: BachsCustomerInput
): Promise<BachsCustomer> {
  return bachsFetch<BachsCustomer>('/customers', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getCustomer(
  customerId: string
): Promise<BachsCustomer> {
  return bachsFetch<BachsCustomer>(`/customers/${customerId}`);
}

export async function getCharge(chargeId: string): Promise<BachsCharge> {
  return bachsFetch<BachsCharge>(`/payments/charges/${chargeId}`);
}

export async function listPayins(params?: {
  customer_id?: string;
  page?: number;
  per_page?: number;
}): Promise<BachsPayinResponse> {
  const searchParams = new URLSearchParams();
  if (params?.customer_id) searchParams.set('customer_id', params.customer_id);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.per_page) searchParams.set('per_page', String(params.per_page));
  const query = searchParams.toString();
  return bachsFetch<BachsPayinResponse>(
    `/payments/payins${query ? `?${query}` : ''}`
  );
}

/* ─── Webhook Signature Verification ─────────────────────────────────── */

export function verifyBachsWebhook(
  rawBody: string,
  timestampHeader: string,
  signatureHeader: string
): BachsWebhookEvent {
  const secret = getWebhookSecret();

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestampHeader, 10)) > 300) {
    throw new Error('Webhook timestamp outside tolerance window');
  }

  const payload = `${timestampHeader}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');

  const sig = Buffer.from(signatureHeader, 'hex');
  const exp = Buffer.from(expected, 'hex');

  if (sig.length !== exp.length) {
    throw new Error('Invalid webhook signature');
  }

  if (!timingSafeEqual(sig, exp)) {
    throw new Error('Invalid webhook signature');
  }

  return JSON.parse(rawBody);
}

/* ─── Product Configuration ───────────────────────────────────────────── */

export const BACHS_CONFIG = {
  products: {
    proMonthly: process.env.BACHS_PRODUCT_PRO_MONTHLY || '',
    proAnnual: process.env.BACHS_PRODUCT_PRO_ANNUAL || '',
    teamMonthly: process.env.BACHS_PRODUCT_TEAM_MONTHLY || '',
    teamAnnual: process.env.BACHS_PRODUCT_TEAM_ANNUAL || '',
    creditsStarter: process.env.BACHS_PRODUCT_CREDITS_STARTER || '',
    creditsGrowth: process.env.BACHS_PRODUCT_CREDITS_GROWTH || '',
    creditsScale: process.env.BACHS_PRODUCT_CREDITS_SCALE || '',
    scanMonthly: process.env.BACHS_PRODUCT_SCAN_MONTHLY || '',
    scanTeamMonthly: process.env.BACHS_PRODUCT_SCAN_TEAM_MONTHLY || '',
  } as const,
} as const;

export const TIER_LIMITS = {
  free: { requestsPerMonth: 1_000, seats: 1, priceMonthly: 0, priceAnnual: 0 },
  pro: { requestsPerMonth: 10_000, seats: 5, priceMonthly: 2000, priceAnnual: 20000 },
  team: { requestsPerMonth: 100_000, seats: Infinity, priceMonthly: 10000, priceAnnual: 100000 },
  enterprise: { requestsPerMonth: Infinity, seats: Infinity, priceMonthly: null, priceAnnual: null },
} as const;

export const CREDIT_TOPUP_PACKS = [
  { label: 'Starter', credits: 50_000, price: 1000, productId: BACHS_CONFIG.products.creditsStarter },
  { label: 'Growth', credits: 250_000, price: 5000, productId: BACHS_CONFIG.products.creditsGrowth },
  { label: 'Scale', credits: 1_000_000, price: 20000, productId: BACHS_CONFIG.products.creditsScale },
] as const;

export const PLATFORM_FEE_PERCENT = 5.5;

/* ─── Product Billing Interval Lookup ─────────────────────────────────── */

const PRODUCT_BILLING_INTERVAL: Record<string, BillingInterval> = {};

function initProductBillingInterval() {
  const p = BACHS_CONFIG.products;
  if (p.proMonthly) PRODUCT_BILLING_INTERVAL[p.proMonthly] = 'month';
  if (p.proAnnual) PRODUCT_BILLING_INTERVAL[p.proAnnual] = 'year';
  if (p.teamMonthly) PRODUCT_BILLING_INTERVAL[p.teamMonthly] = 'month';
  if (p.teamAnnual) PRODUCT_BILLING_INTERVAL[p.teamAnnual] = 'year';
  if (p.scanMonthly) PRODUCT_BILLING_INTERVAL[p.scanMonthly] = 'month';
  if (p.scanTeamMonthly) PRODUCT_BILLING_INTERVAL[p.scanTeamMonthly] = 'month';
}

let _intervalInit = false;
function ensureIntervalInit() {
  if (!_intervalInit) {
    initProductBillingInterval();
    _intervalInit = true;
  }
}

/* ─── Product → Tier Type Lookup ──────────────────────────────────────── */

const PRODUCT_TIER: Record<string, SubscriptionTier> = {};

function initProductTier() {
  const p = BACHS_CONFIG.products;
  if (p.proMonthly) PRODUCT_TIER[p.proMonthly] = 'pro';
  if (p.proAnnual) PRODUCT_TIER[p.proAnnual] = 'pro';
  if (p.teamMonthly) PRODUCT_TIER[p.teamMonthly] = 'team';
  if (p.teamAnnual) PRODUCT_TIER[p.teamAnnual] = 'team';
}

let _tierInit = false;
function ensureTierInit() {
  if (!_tierInit) {
    initProductTier();
    _tierInit = true;
  }
}

/* ─── Helper Functions ────────────────────────────────────────────────── */

export function getProductId(
  tier: SubscriptionTier,
  interval: BillingInterval
): string {
  const key = `${tier}${
    interval === 'month' ? 'Monthly' : 'Annual'
  }` as keyof typeof BACHS_CONFIG.products;
  const id = BACHS_CONFIG.products[key];
  if (!id) throw new Error(`No Bachs product configured for ${tier}/${interval}`);
  return id;
}

export function getScanProductId(tier: 'scan' | 'scan_team'): string {
  const id =
    tier === 'scan'
      ? BACHS_CONFIG.products.scanMonthly
      : BACHS_CONFIG.products.scanTeamMonthly;
  if (!id) throw new Error(`No Bachs product configured for ${tier}`);
  return id;
}

export function getScanTierByProductId(
  productId: string
): 'scan' | 'scan_team' | null {
  if (productId === BACHS_CONFIG.products.scanMonthly) return 'scan';
  if (productId === BACHS_CONFIG.products.scanTeamMonthly) return 'scan_team';
  return null;
}

export function getSubscriptionTierFromProductId(
  productId: string
): SubscriptionTier | null {
  ensureTierInit();
  return PRODUCT_TIER[productId] || null;
}

export function getCreditTopupPackConfig(productId: string) {
  return CREDIT_TOPUP_PACKS.find((p) => p.productId === productId) || null;
}

export function getCreditTopupCreditsByProductId(
  productId: string
): number | null {
  const pack = getCreditTopupPackConfig(productId);
  return pack ? pack.credits : null;
}

export function netCreditsAfterFee(grossCredits: number): number {
  return Math.floor(grossCredits * (1 - PLATFORM_FEE_PERCENT / 100));
}

export function getBillingInterval(
  productId: string
): BillingInterval | null {
  ensureIntervalInit();
  return PRODUCT_BILLING_INTERVAL[productId] || null;
}

export function getProductTypeFromId(
  productId: string
): BachsProductType | null {
  const p = BACHS_CONFIG.products;
  if (
    productId === p.proMonthly ||
    productId === p.proAnnual ||
    productId === p.teamMonthly ||
    productId === p.teamAnnual
  ) {
    return 'subscription';
  }
  if (
    productId === p.creditsStarter ||
    productId === p.creditsGrowth ||
    productId === p.creditsScale
  ) {
    return 'credits_topup';
  }
  if (productId === p.scanMonthly || productId === p.scanTeamMonthly) {
    return 'scan_subscription';
  }
  return null;
}

export function computePeriodEnd(
  interval: BillingInterval,
  from: Date = new Date()
): Date {
  const d = new Date(from);
  if (interval === 'year') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d;
}
