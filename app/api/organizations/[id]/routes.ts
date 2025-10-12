import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabaseServer";

const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  user_id: z.string(),
  created_at: z.string().optional(),
});

type Organization = z.infer<typeof organizationSchema>;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "Missing organization id" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    // Not found vs DB error: Supabase returns 406 or 404 depending on case — surface it clearly
    const status = error.code === "PGRST116" ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  if (!data) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  // Runtime validation so TypeScript can trust the shape
  const parsed = organizationSchema.safeParse(data);
  if (!parsed.success) {
    // Unexpected DB shape — return 500 with info for debugging
    return NextResponse.json(
      { error: "Data validation failed", details: parsed.error.flatten() },
      { status: 500 }
    );
  }

  const org: Organization = parsed.data;
  return NextResponse.json(org);
}
