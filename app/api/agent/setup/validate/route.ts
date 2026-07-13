import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseAdmin";
import crypto from "crypto";

// POST /api/agent/setup/validate
// Called by the install script to validate an API key and return agent info
export async function GET(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "").trim();

    if (!apiKey) {
        return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const supabase = createAdminClient();
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // First, check if the key exists at all
    const { data: basicKey, error: basicError } = await supabase
        .from("api_keys")
        .select("id, project_id, agent_id, revoked_at")
        .eq("key_hash", keyHash)
        .single();

    if (basicError || !basicKey) {
        console.error("[validate] No key found for hash prefix:", keyHash.substring(0, 8), basicError?.message);
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    if (basicKey.revoked_at) {
        console.error("[validate] Key is revoked:", basicKey.id);
        return NextResponse.json({ error: "API key has been revoked" }, { status: 401 });
    }

    const { data: keyData, error } = await supabase
        .from("api_keys")
        .select(`
            id,
            name,
            project_id,
            agent_id,
            projects!inner(
                id,
                name,
                slug,
                organization_id,
                organizations!inner(
                    id,
                    name,
                    slug
                )
            )
        `)
        .eq("key_hash", keyHash)
        .is("revoked_at", null)
        .single();

    if (error || !keyData) {
        console.error("[validate] Key found but join failed:", error?.message);
        return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
    }

    const project = keyData.projects as any;
    const org = project.organizations;

    // If key is tied to a specific agent, return that agent's info directly
    let agent = null;
    if (keyData.agent_id) {
        const { data: agentData } = await supabase
            .from("agents")
            .select("id, name, blueprint, agent_configs(model)")
            .eq("id", keyData.agent_id)
            .single();

        if (agentData) {
            const config = Array.isArray(agentData.agent_configs) ? agentData.agent_configs[0] : agentData.agent_configs;
            agent = {
                id: agentData.id,
                name: agentData.name,
                blueprint: agentData.blueprint,
                model: config?.model || "gpt-4o-mini",
            };
        }
    }

    // Fetch all active agents with their configured model
    const { data: agents } = await supabase
        .from("agents")
        .select("id, name, blueprint, agent_configs(model)")
        .eq("project_id", project.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

    return NextResponse.json({
        valid: true,
        // If key is agent-scoped, return agent info at top level
        agent_id: agent?.id || null,
        agent_name: agent?.name || null,
        agent_model: agent?.model || null,
        project_id: project.id,
        project_name: project.name,
        project_slug: project.slug,
        org_name: org.name,
        org_slug: org.slug,
        agents: (agents || []).map(a => {
            const config = Array.isArray(a.agent_configs) ? a.agent_configs[0] : a.agent_configs;
            return {
                id: a.id,
                name: a.name,
                blueprint: a.blueprint,
                model: config?.model || "gpt-4o-mini",
            };
        }),
        dashboard_url: `https://cencori.com/${org.slug}/${project.slug}`,
    });
}

// POST /api/agent/setup/validate
// Create a new agent for a project (authenticated by API key)
export async function POST(req: NextRequest) {
    const authHeader = req.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "").trim();

    if (!apiKey) {
        return NextResponse.json({ error: "Missing API key" }, { status: 401 });
    }

    const body = await req.json();
    const { agent_name, project_id } = body;

    if (!agent_name || !project_id) {
        return NextResponse.json({ error: "Missing agent_name or project_id" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const keyHash = crypto.createHash("sha256").update(apiKey).digest("hex");

    // Verify the API key is valid and belongs to this project
    const { data: keyData } = await supabase
        .from("api_keys")
        .select("id, project_id")
        .eq("key_hash", keyHash)
        .is("revoked_at", null)
        .single();

    if (!keyData || keyData.project_id !== project_id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create the agent
    const { data: agent, error: agentError } = await supabase
        .from("agents")
        .insert({
            project_id,
            name: agent_name,
            blueprint: "openclaw",
            is_active: true,
            shadow_mode: true,
        })
        .select("id, name")
        .single();

    if (agentError || !agent) {
        return NextResponse.json({ error: "Failed to create agent" }, { status: 500 });
    }

    // Create default config
    await supabase.from("agent_configs").insert({
        agent_id: agent.id,
        model: "gpt-4o-mini",
        system_prompt: "You are a helpful desktop assistant powered by OpenClaw.",
        temperature: 0.7,
    });

    // Link the API key to this agent
    await supabase
        .from("api_keys")
        .update({ agent_id: agent.id })
        .eq("id", keyData.id);

    return NextResponse.json({
        id: agent.id,
        name: agent.name,
        model: "gpt-4o-mini",
    });
}
