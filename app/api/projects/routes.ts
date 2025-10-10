import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

interface ProjectRequestBody {
    name: string;
    description?: string;
    user_id: string;
}

export async function POST(req: Request) {
    try {
        const supabase = createServerClient();
        const body: ProjectRequestBody = await req.json();

        const { name, description, user_id } = body;

        if (!name || !user_id) {
            return NextResponse.json(
                { error: "Missing required fields" }, 
                { status: 400 });
        }

        const { data, error } = await supabase
            .from("projects")
            .insert([{ name, description, user_id }])
            .select()
            .single();
        
        if (error) throw error;

        return NextResponse.json({ projects: data }, { status: 201 });
    } catch (err: unknown) {
        console.error(err);
        const message = 
            err instanceof Error ? err.message : "Internal server error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}