/**
 * Cencori for Basecode Desktop.
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
 *
 * One catch-all rather than a file per path, because every one of them does the same four things:
 * authenticate the user, check what they may spend, forward under the product key, stream back.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateBasecodeDataRequest } from "@/lib/basecode-data";
import { noStoreHeaders } from "@/lib/basecode-auth";

const GATEWAY_BASE =
  process.env.BASECODE_GATEWAY_URL?.trim().replace(/\/+$/, "") || "https://api.cencori.com/v1";

/**
 * What Basecode may reach, and what it costs.
 *
 * An allowlist rather than a blind forward: this route holds the product's key, so anything it
 * will pass through is something any signed-in user can spend that key on. `generates` is what
 * decides whether the plan is checked — listing models costs nothing, and gating it would leave a
 * user at their limit unable to see which models exist, which reads as the app being broken rather
 * than as a limit being reached.
 */
const ROUTES: Record<string, { generates: boolean; methods: string[] }> = {
  "chat/completions": { generates: true, methods: ["POST"] },
  models: { generates: false, methods: ["GET"] },
  responses: { generates: true, methods: ["POST"] },
};

/** The product's own Cencori key. Server-only: it is never sent to a client. */
const PRODUCT_KEY = process.env.BASECODE_GATEWAY_API_KEY?.trim();

/** A turn's worth of prompt is large, and refusing it here would be a worse failure than the cost. */
const MAX_BODY_BYTES = 8 * 1024 * 1024;

function json(body: unknown, status: number) {
  return NextResponse.json(body, { headers: noStoreHeaders(), status });
}

async function forward(req: NextRequest, path: string[]): Promise<Response> {
  const route = ROUTES[path.join("/")];
  if (!route || !route.methods.includes(req.method)) {
    return json({ error: "Not found", code: "unknown_route" }, 404);
  }

  const session = await authenticateBasecodeDataRequest(req.headers.get("authorization"));
  if (!session) {
    return json({ error: "Sign in to Basecode to continue.", code: "unauthenticated" }, 401);
  }

  if (!PRODUCT_KEY) {
    // Configuration, not the user's problem — say so rather than blaming their session.
    console.error("[BasecodeInference] BASECODE_GATEWAY_API_KEY is not configured");
    return json(
      { error: "Basecode inference is not configured.", code: "gateway_unconfigured" },
      503,
    );
  }

  let body: string | undefined;
  if (req.method === "POST") {
    body = await req.text();
    if (body.length > MAX_BODY_BYTES) {
      return json({ error: "This request is too large to send.", code: "request_too_large" }, 413);
    }
  }

  if (route.generates) {
    const { data: access, error: accessError } = await session.admin.rpc(
      "basecode_gateway_access",
      { p_user_id: session.user.id },
    );
    if (accessError) {
      console.error("[BasecodeInference] entitlement lookup failed", accessError);
      return json(
        {
          error: "Basecode could not verify this turn. Try again shortly.",
          code: "usage_unavailable",
        },
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
    if (body) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        body = JSON.stringify({ ...parsed, user: session.user.id });
      } catch {
        // Unparseable bodies are the gateway's to reject, with its own error rather than ours.
      }
    }
  }

  const upstream = await fetch(`${GATEWAY_BASE}/${path.join("/")}`, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${PRODUCT_KEY}`,
      "Content-Type": "application/json",
      "X-Cencori-User-IP": req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "",
    },
    ...(body === undefined ? {} : { body }),
  });

  // The body is handed back as it arrives rather than read to completion: these are streaming
  // endpoints, and buffering here would put the whole answer's generation time back in front of
  // the first token — the exact problem the streaming work removed, and the cost this extra hop is
  // otherwise most likely to reintroduce.
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

type RouteContext = { params: Promise<{ path: string[] }> };

export async function GET(req: NextRequest, context: RouteContext): Promise<Response> {
  return forward(req, (await context.params).path);
}

export async function POST(req: NextRequest, context: RouteContext): Promise<Response> {
  return forward(req, (await context.params).path);
}
