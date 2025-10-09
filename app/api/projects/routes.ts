import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

export async function POST(req: Request) {
    try {
        const supabase = createServerClient();
        const body = await req.json();

        const { name, description, user_id } = body;

        if (!name || !user_id) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const { data, error } = await supabase
            .from("projects")
            .insert([{ name, description, user_id }])
            .select()
            .single();
        
        if (error) throw error;

        return NextResponse.json({ projects: data }, { status: 201 });
    } catch (err: any) {
        console.error(err);
        return NextResponse.json({ error: err.message }, {status: 500});
    }
}