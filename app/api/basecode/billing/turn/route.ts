import { NextRequest, NextResponse } from "next/server";
import { authenticateBasecodeBillingRequest } from "@/lib/basecode-billing";
import { isUuid, readThreadUsageEntries } from "@/lib/basecode-data";
import { noStoreHeaders } from "@/lib/basecode-auth";

type TurnBillingBody = {
  action?: unknown;
  clientTurnKey?: unknown;
  model?: unknown;
  runtimeTurnId?: unknown;
  threadId?: unknown;
  threadTokens?: unknown;
};

export async function POST(request: NextRequest) {
  const session = await authenticateBasecodeBillingRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Your Cencori session is invalid." },
      { headers: noStoreHeaders(), status: 401 },
    );
  }

  let body: TurnBillingBody;
  try {
    body = (await request.json()) as TurnBillingBody;
  } catch {
    return NextResponse.json(
      { error: "The Basecode usage request is invalid." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }
  /**
   * Release the leases a previous run of the app left behind.
   *
   * A reservation is held for two hours and closed by the turn that opened it. A process that dies
   * first — a crash, a force quit, a developer killing the app — closes nothing, and the key is a
   * per-turn UUID held only in that process's memory, so nothing can ever close it again. The next
   * launch then meets its own abandoned lease as a concurrency limit and the user is locked out
   * until the two hours elapse, with no action available to them that helps.
   *
   * A freshly started app has no turn in flight by definition, which is the one moment this can be
   * said safely. It is called there and nowhere else.
   *
   * Answered before the turn-key guard below, because this action carries no turn key — it is
   * closing keys that no longer exist anywhere.
   */
  if (body.action === "release-stale") {
    const { data: account } = await session.admin
      .from("basecode_billing_accounts")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (!account?.id) {
      return NextResponse.json({ released: 0 }, { headers: noStoreHeaders() });
    }

    const { data: released, error } = await session.admin
      .from("basecode_turn_reservations")
      .update({ status: "released", completed_at: new Date().toISOString() })
      .eq("account_id", account.id)
      .in("status", ["reserved", "running"])
      .select("id");
    if (error) {
      console.error("[Basecode Billing] Releasing stale reservations failed", error);
      return NextResponse.json(
        { error: "Basecode could not release the previous reservations." },
        { headers: noStoreHeaders(), status: 503 },
      );
    }
    return NextResponse.json(
      { released: released?.length ?? 0 },
      { headers: noStoreHeaders() },
    );
  }

  if (!isUuid(body.clientTurnKey)) {
    return NextResponse.json(
      { error: "The Basecode turn key is invalid." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  if (body.action === "reserve") {
    const model = typeof body.model === "string" ? body.model.slice(0, 160) : null;
    const { data, error } = await session.admin.rpc("basecode_reserve_turn", {
      p_user_id: session.user.id,
      p_client_turn_key: body.clientTurnKey,
      p_model: model,
    });
    if (error) {
      console.error("[Basecode Billing] Turn reservation failed", error);
      return NextResponse.json(
        { error: "Basecode could not reserve usage for this turn." },
        { headers: noStoreHeaders(), status: 503 },
      );
    }
    const result = data as { allowed?: boolean; reason?: string } | null;
    return NextResponse.json(result ?? { allowed: false }, {
      headers: noStoreHeaders(),
      status: result?.allowed ? 200 : result?.reason === "concurrency_limit" ? 409 : 429,
    });
  }

  if (body.action === "finish") {
    const runtimeTurnId =
      typeof body.runtimeTurnId === "string" ? body.runtimeTurnId.slice(0, 200) : null;
    const { data, error } = await session.admin.rpc("basecode_finish_turn", {
      p_user_id: session.user.id,
      p_client_turn_key: body.clientTurnKey,
      p_runtime_turn_id: runtimeTurnId,
    });
    if (error) {
      console.error("[Basecode Billing] Turn finalization failed", error);
      return NextResponse.json(
        { error: "Basecode could not finish the usage reservation." },
        { headers: noStoreHeaders(), status: 503 },
      );
    }
    // The count is the *thread's* running total, not this turn's own spend, so it is stored as a
    // replace against the thread rather than summed across the thread's turns. Recorded after the
    // lease closes and never allowed to fail it: a turn must release its reservation either way.
    const [usage] = readThreadUsageEntries([
      { threadId: body.threadId, tokens: body.threadTokens, updatedAt: Date.now() },
    ]);
    if (usage) {
      const { error: usageError } = await session.admin.rpc("basecode_record_thread_usage", {
        p_user_id: session.user.id,
        p_threads: [usage],
      });
      if (usageError) {
        console.error("[Basecode Billing] Thread usage could not be recorded", usageError);
      }
    }

    return NextResponse.json({ finished: data === true }, { headers: noStoreHeaders() });
  }

  return NextResponse.json(
    { error: "The Basecode usage action is invalid." },
    { headers: noStoreHeaders(), status: 400 },
  );
}
