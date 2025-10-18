// app/api/onboarding/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";

const bodySchema = z.object({
  project_type: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  try {
    // create a server client bound to request cookies (App Router friendly)
    const supabase = createServerComponentClient({ cookies });

    // get user from the server client (reads cookies)
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    // validate payload
    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const updates = {
      id: userId, // ensure upsert uses the auth id as PK
      project_type: parsed.data.project_type ?? null,
      role: parsed.data.role ?? null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    // upsert ensures the row exists or is updated
    const { data: upserted, error: upsertErr } = await supabase
      .from("users")
      .upsert([updates], { onConflict: "id" })
      .select()
      .single();

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: upserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("Unexpected onboarding error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
