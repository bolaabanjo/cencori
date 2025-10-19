import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabaseServer";

interface ProjectRequestBody {
    name: string;
    description?: string;
    // user_id: string; // Removed as it's now derived from auth
}

export async function POST(req: Request) {
    try {
        const supabase = createServerClient();

        // Check auth for POST request
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
    
        if (authError || !user) {
          return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
        }

        const body: ProjectRequestBody = await req.json();

        const { name, description } = body;

        if (!name) { // Removed user_id check as we now get it from auth
            return NextResponse.json(
                { error: "Missing required fields" }, 
                { status: 400 });
        }

        const { data, error } = await supabase
            .from("projects")
            .insert([{ name, description, user_id: user.id }]) // Use authenticated user's ID
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