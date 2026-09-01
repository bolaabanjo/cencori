import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { applyVerifiedBasecodePayment, majorAmountToMinor } from "@/lib/basecode-billing";
import {
  verifyFlutterwaveTransaction,
  verifyFlutterwaveWebhook,
} from "@/lib/flutterwaveClient";
import { createAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type FlutterwaveWebhook = {
  id?: string;
  webhook_id?: string;
  type?: string;
  event?: string;
  data?: {
    id?: number;
    tx_ref?: string;
    status?: string;
  };
};

async function markEvent(
  eventId: string,
  status: "processed" | "ignored" | "failed",
  error?: string,
) {
  const admin = createAdminClient();
  await admin
    .from("basecode_webhook_events")
    .update({ status, error: error?.slice(0, 500) ?? null, processed_at: new Date().toISOString() })
    .eq("provider", "flutterwave")
    .eq("provider_event_id", eventId);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  let signatureValid = false;
  try {
    signatureValid = verifyFlutterwaveWebhook(
      rawBody,
      request.headers.get("flutterwave-signature"),
    );
  } catch (error) {
    console.error("[Basecode Flutterwave] Webhook configuration error", error);
    return NextResponse.json({ error: "Webhook unavailable" }, { status: 503 });
  }
  if (!signatureValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: FlutterwaveWebhook;
  try {
    event = JSON.parse(rawBody) as FlutterwaveWebhook;
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventId = event.id || event.webhook_id;
  const eventType = event.type || event.event || "unknown";
  if (!eventId || eventId.length > 200) {
    return NextResponse.json({ error: "Missing event ID" }, { status: 400 });
  }

  const admin = createAdminClient();
  const payloadSha256 = createHash("sha256").update(rawBody).digest("hex");
  const { error: claimError } = await admin.from("basecode_webhook_events").insert({
    provider: "flutterwave",
    provider_event_id: eventId,
    event_type: eventType,
    payload_sha256: payloadSha256,
    status: "processing",
  });
  if (claimError?.code === "23505") {
    const { data: previous, error: previousError } = await admin
      .from("basecode_webhook_events")
      .select("status, payload_sha256")
      .eq("provider", "flutterwave")
      .eq("provider_event_id", eventId)
      .maybeSingle();
    if (previousError || !previous) {
      return NextResponse.json({ error: "Webhook persistence failed" }, { status: 500 });
    }
    if (previous.payload_sha256 !== payloadSha256) {
      return NextResponse.json({ error: "Webhook event mismatch" }, { status: 409 });
    }
    if (previous.status !== "failed") return NextResponse.json({ received: true });
    const { data: retry, error: retryError } = await admin
      .from("basecode_webhook_events")
      .update({ status: "processing", error: null, processed_at: null })
      .eq("provider", "flutterwave")
      .eq("provider_event_id", eventId)
      .eq("status", "failed")
      .select("id")
      .maybeSingle();
    if (retryError) {
      return NextResponse.json({ error: "Webhook persistence failed" }, { status: 500 });
    }
    if (!retry) return NextResponse.json({ received: true });
  }
  if (claimError) {
    console.error("[Basecode Flutterwave] Could not claim webhook", claimError);
    return NextResponse.json({ error: "Webhook persistence failed" }, { status: 500 });
  }

  if (eventType !== "charge.completed" || !event.data?.id) {
    await markEvent(eventId, "ignored");
    return NextResponse.json({ received: true });
  }

  try {
    const transaction = await verifyFlutterwaveTransaction(event.data.id);
    const amountMinor = majorAmountToMinor(transaction.amount);
    if (
      transaction.status !== "successful" ||
      !transaction.tx_ref ||
      !amountMinor ||
      transaction.currency !== "NGN"
    ) {
      await markEvent(eventId, "ignored", "Transaction did not verify as a successful NGN payment.");
      return NextResponse.json({ received: true });
    }

    await applyVerifiedBasecodePayment(admin, {
      provider: "flutterwave",
      providerTransactionId: String(transaction.id),
      reference: transaction.tx_ref,
      amountMinor,
      currency: "NGN",
      paymentMethod: transaction.payment_type,
      paidAt: transaction.created_at,
      providerCustomerId: transaction.customer?.id ? String(transaction.customer.id) : null,
      providerPayload: transaction as unknown as Record<string, unknown>,
    });
    await markEvent(eventId, "processed");
    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing error";
    console.error("[Basecode Flutterwave] Processing failed", error);
    await markEvent(eventId, "failed", message);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}
