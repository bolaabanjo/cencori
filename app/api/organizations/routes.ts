import { NextResponse } from "next/server"; 
import { createServerClient } from "@/lib/supabaseServer";

export async function GET(_req: Request) {
    const supabase = createServerClient();

    const { data: orgs, error } = await supabase
        .from("organizations")
        .select("*");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ organizations: orgs });
}