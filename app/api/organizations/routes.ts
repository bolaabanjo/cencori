import { NextResponse } from "next/server"; 
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: Request) {
    const supabase = supabaseServer();

    const { data: orgs, error } = await supabase
        .from("organizations")
        .select("*");

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ organizations: orgs });
}