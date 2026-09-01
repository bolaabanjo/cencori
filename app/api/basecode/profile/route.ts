import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/basecode-auth";
import { authenticateBasecodeBillingRequest } from "@/lib/basecode-billing";
import {
  cleanName,
  profileJson,
  readProfileRow,
  validateUsername,
  writeProfile,
} from "@/lib/basecode-profile";

/**
 * The desktop's view of who you are.
 *
 * Separate from /api/user/profile because that one authenticates a browser session from a cookie,
 * and Basecode has no cookies -- it holds a bearer token. Same table, same rules, different door.
 */
export async function GET(request: NextRequest) {
  const session = await authenticateBasecodeBillingRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Your Cencori session is invalid." },
      { headers: noStoreHeaders(), status: 401 },
    );
  }
  const row = await readProfileRow(session.admin, session.user.id);
  return NextResponse.json(
    { profile: profileJson(row, session.user) },
    { headers: noStoreHeaders() },
  );
}

export async function PATCH(request: NextRequest) {
  const session = await authenticateBasecodeBillingRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Your Cencori session is invalid." },
      { headers: noStoreHeaders(), status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "That profile change is invalid." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  // Only what was sent. An absent key means "leave it", which is not the same as null, which means
  // "clear it" -- the desktop saves one field at a time and must not blank the others.
  const patch: Record<string, string | null> = {};
  if ("firstName" in body) patch.first_name = cleanName(body.firstName);
  if ("lastName" in body) patch.last_name = cleanName(body.lastName);
  if ("username" in body) {
    const username = validateUsername(body.username);
    if (!username.ok) {
      return NextResponse.json(
        { error: username.reason },
        { headers: noStoreHeaders(), status: 400 },
      );
    }
    patch.username = username.value;
  }

  const written = await writeProfile(session.admin, session.user.id, patch);
  if (written.error) {
    return NextResponse.json(
      { error: written.error },
      { headers: noStoreHeaders(), status: written.error.includes("taken") ? 409 : 400 },
    );
  }

  const row = await readProfileRow(session.admin, session.user.id);
  return NextResponse.json(
    { profile: profileJson(row, session.user) },
    { headers: noStoreHeaders() },
  );
}
