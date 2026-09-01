import { NextRequest, NextResponse } from "next/server";
import {
  authenticateBasecodeBillingRequest,
  getBasecodeBillingSnapshot,
} from "@/lib/basecode-billing";
import { noStoreHeaders } from "@/lib/basecode-auth";

export async function GET(request: NextRequest) {
  const session = await authenticateBasecodeBillingRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Your Cencori session is invalid." },
      { headers: noStoreHeaders(), status: 401 },
    );
  }

  try {
    const snapshot = await getBasecodeBillingSnapshot(session.admin, session.user.id);
    return NextResponse.json(snapshot, { headers: noStoreHeaders() });
  } catch (error) {
    console.error("[Basecode Billing] Snapshot failed", error);
    return NextResponse.json(
      { error: "Basecode billing is temporarily unavailable." },
      { headers: noStoreHeaders(), status: 503 },
    );
  }
}
