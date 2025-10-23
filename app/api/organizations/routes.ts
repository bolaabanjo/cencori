import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabaseServer";

// --- Schema definitions ---
const organizationSchema = z.object({
  name: z.string().min(2, "Organization name must be at least 2 characters"),
  description: z.string().optional(),
});

const dbOrgSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  slug: z.string(),
  user_id: z.string(),
  created_at: z.string().optional(),
});

type Organization = z.infer<typeof dbOrgSchema>;

// --- Utility functions ---
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 60);
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

// --- GET /api/organizations ---
export async function GET(): Promise<NextResponse> {
  const supabase = createServerClient();

  // Check auth for GET request
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
  }

  const { data: organizations, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("user_id", user.id); // Filter organizations by user ID

  if (error) {
    console.error("GET /api/organizations error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ organizations });
}

// --- POST /api/organizations ---
export async function POST(req: Request): Promise<NextResponse> {
  const supabase = createServerClient();

  try {
    // Auth
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      console.error("Organization creation authentication failed:", { authError, user });
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    // Validate request
    const body = await req.json();
    const parsed = organizationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { name, description } = parsed.data;

    // Generate unique slug
    let slug = slugify(name);
    if (!slug) slug = `org-${shortId()}`;

    const { data: existing } = await supabase
      .from("organizations")
      .select("id")
      .eq("slug", slug)
      .limit(1);

    if (existing && existing.length > 0) {
      slug = `${slug}-${shortId()}`;
    }

    // Insert org
    const { data, error: insertError } = await supabase
      .from("organizations")
      .insert([
        {
          name,
          description: description ?? null,
          slug,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("DB insert error /api/organizations:", insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Validate DB shape
    const valid = dbOrgSchema.safeParse(data);
    if (!valid.success) {
      console.error("Organization schema mismatch:", valid.error.flatten());
      return NextResponse.json(
        { error: "Organization shape invalid after insertion" },
        { status: 500 }
      );
    }

    return NextResponse.json({ organization: valid.data }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown server error";
    console.error("POST /api/organizations unexpected error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
