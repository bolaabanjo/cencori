/**
 * Inference for Basecode Desktop.
 *
 * Basecode is a product built on Cencori, so it is one customer with one project and one key —
 * the same shape as anything else built on the platform. That key is a secret and cannot ship
 * inside a desktop app, where anyone could read it out of the bundle, so it stays here and the app
 * never sees it. The desktop authenticates as the signed-in user, exactly as it already does for
 * auth, billing, data and profile; this is the last call that was reaching the gateway directly.
 *
 * What it replaced: sign-in minted a Cencori key per user and bound it to whichever project that
 * account happened to create first. Every Basecode user was a separate Cencori customer, and their
 * usage was logged in a project they never chose and were never told about.
 *
 * The plan check has to happen here. It used to be the gateway's, which recognised a Basecode key
 * by `client_app` and called the entitlement function itself. A product key carries no such mark,
 * so without this a user could spend past their Basecode plan on the product's credits.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateBasecodeDataRequest } from "@/lib/basecode-data";
import { noStoreHeaders } from "@/lib/basecode-auth";

const GATEWAY_URL =
  process.env.BASECODE_GATEWAY_URL?.trim() || "https://api.cencori.com/v1/responses";

/** The product's own Cencori key. Server-only: it is never sent to a client. */
const PRODUCT_KEY = process.env.BASECODE_GATEWAY_API_KEY?.trim();

/** A turn's worth of prompt is large, and refusing it here would be a worse failure than the cost. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { headers: noStoreHeaders(), status });
}

export async function POST(req: NextRequest) {
  const session = await authenticateBasecodeDataRequest(req.headers.get("authorization"));
  if (!session) {
    return json({ error: "Sign in to Basecode to run a turn.", code: "unauthenticated" }, 401);
  }

  if (!PRODUCT_KEY) {
    // Configuration, not the user's problem — say so rather than blaming their session.
    console.error("[BasecodeInference] BASECODE_GATEWAY_API_KEY is not configured");
    return json(
      { error: "Basecode inference is not configured.", code: "gateway_unconfigured" },
      503,
    );
  }

  const body = await req.text();
  if (body.length > MAX_BODY_BYTES) {
    return json({ error: "This turn is too large to send.", code: "request_too_large" }, 413);
  }

  const { data: access, error: accessError } = await session.admin.rpc("basecode_gateway_access", {
    p_user_id: session.user.id,
  });
  if (accessError) {
    console.error("[BasecodeInference] entitlement lookup failed", accessError);
    return json(
      { error: "Basecode could not verify this turn. Try again shortly.", code: "usage_unavailable" },
      503,
    );
  }
  const entitlement = access as { allowed?: boolean; reason?: string; reset_at?: string } | null;
  if (!entitlement?.allowed) {
    return json(
      {
        error: "Basecode usage limit reached",
        code: entitlement?.reason ?? "usage_limited",
        reset_at: entitlement?.reset_at ?? null,
      },
      entitlement?.reason === "concurrency_limit" ? 409 : 429,
    );
  }

  // Every turn is attributed to the person who ran it. The gateway reads `user` as the end user,
  // so one product key still tells the project's owner which of their users spent what.
  let payload = body;
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    payload = JSON.stringify({ ...parsed, user: session.user.id });
  } catch {
    // Unparseable bodies are the gateway's to reject, with its own error rather than ours.
  }

  const upstream = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PRODUCT_KEY}`,
      "Content-Type": "application/json",
      "X-Cencori-User-IP": req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    },
    body: payload,
  });

  // The body is handed back as it arrives rather than read to completion: this is a streaming
  // endpoint, and buffering it here would put the whole answer's generation time back in front of
  // the first token — the exact problem the streaming work removed.
  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      // Proxies that buffer would defeat the streaming above.
      "X-Accel-Buffering": "no",
    },
  });
}
