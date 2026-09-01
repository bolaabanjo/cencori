import { NextRequest, NextResponse } from "next/server";
import { noStoreHeaders } from "@/lib/basecode-auth";
import { authenticateBasecodeBillingRequest } from "@/lib/basecode-billing";
import { profileJson, readProfileRow, writeProfile } from "@/lib/basecode-profile";

const BUCKET = "avatars";
const MAX_BYTES = 2 * 1024 * 1024;
/**
 * Matched against what the bytes say they are, not against a filename anyone can rename.
 *
 * JPEG and PNG only. GIF invites an animated avatar, which is a decision about the product rather
 * than a format; WebP is fine but nothing here produces it, and every extra type is another shape
 * every surface that draws an avatar has to cope with.
 */
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

export async function POST(request: NextRequest) {
  const session = await authenticateBasecodeBillingRequest(request);
  if (!session) {
    return NextResponse.json(
      { error: "Your Cencori session is invalid." },
      { headers: noStoreHeaders(), status: 401 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "That upload is invalid." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "No picture was sent." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }
  const extension = ALLOWED.get(file.type);
  if (!extension) {
    return NextResponse.json(
      { error: "Pictures have to be JPG, JPEG or PNG." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Pictures are at most 2MB." },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  // Named by the moment it arrived so a replaced picture never reuses a URL a client has cached.
  const path = `${session.user.id}/${Date.now()}.${extension}`;
  const { error: uploadError } = await session.admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) {
    console.error("[Basecode Profile] Avatar upload failed", uploadError);
    return NextResponse.json(
      { error: "Your picture could not be saved." },
      { headers: noStoreHeaders(), status: 503 },
    );
  }

  const { data: url } = session.admin.storage.from(BUCKET).getPublicUrl(path);
  const written = await writeProfile(session.admin, session.user.id, { avatar_url: url.publicUrl });
  if (written.error) {
    return NextResponse.json(
      { error: written.error },
      { headers: noStoreHeaders(), status: 400 },
    );
  }

  // Only once the new picture is the one on record: a delete that runs first would leave the
  // account with no picture at all if the upload behind it failed.
  const { data: existing } = await session.admin.storage.from(BUCKET).list(session.user.id);
  const stale = (existing ?? [])
    .map((item) => `${session.user.id}/${item.name}`)
    .filter((name) => name !== path);
  if (stale.length > 0) await session.admin.storage.from(BUCKET).remove(stale);

  const row = await readProfileRow(session.admin, session.user.id);
  return NextResponse.json(
    { profile: profileJson(row, session.user) },
    { headers: noStoreHeaders() },
  );
}
