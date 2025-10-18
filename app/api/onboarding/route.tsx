// app/api/onboarding/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabaseServer";

const bodySchema = z.object({
  project_type: z.string().optional(),
  role: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const supabase = createServerClient(); // server client using SERVICE ROLE key

    // verify auth
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }
    const userId = authData.user.id;

    const body = await req.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.format() }, { status: 400 });
    }

    const updates = {
      id: userId, // IMPORTANT: upsert requires id to match PK
      project_type: parsed.data.project_type ?? null,
      role: parsed.data.role ?? null,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    };

    // Upsert so row exists (insert or update)
    const { data: upserted, error: upsertErr } = await supabase
      .from("users")
      .upsert([updates], { onConflict: "id" }) // depends on Postgres version; Supabase supports onConflict
      .select()
      .single();

    if (upsertErr) {
      console.error("Server upsert error:", upsertErr);
      return NextResponse.json({ error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user: upserted });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("Unexpected onboarding error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

