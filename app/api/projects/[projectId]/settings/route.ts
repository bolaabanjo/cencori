"use server";

import { NextRequest, NextResponse } from "next/server";
import { requireProjectAccess } from '@/lib/require-project-access';
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit-log";

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ProviderSettings {
    default_provider?: string;
    default_model?: string;
    requests_per_minute?: number;
    tokens_per_day?: number;
    concurrent_requests?: number;
    enable_fallback?: boolean;
    fallback_provider?: string;
    max_retries_before_fallback?: number;
    circuit_breaker_enabled?: boolean;
    circuit_breaker_failure_threshold?: number;
    circuit_breaker_timeout_seconds?: number;
    fallback_model?: string;
    ragmetrics_enabled?: boolean;
    ragmetrics_api_key?: string;
    ragmetrics_config?: any;
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;
        const body: ProviderSettings = await request.json();

        const { data: project, error: projectError } = await supabaseAdmin
            .from("projects")
            .select("id, organization_id")
            .eq("id", projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json(
                { error: "Project not found" },
                { status: 404 }
            );
        }

        const { data: existingSettings } = await supabaseAdmin
            .from("project_settings")
            .select("id")
            .eq("project_id", projectId)
            .single();

        if (existingSettings) {
            // Build update object dynamically to avoid wiping out fields not sent in the request
            const updateData: any = {
                updated_at: new Date().toISOString(),
            };

            if (body.default_provider !== undefined) updateData.default_provider = body.default_provider;
            if (body.default_model !== undefined) updateData.default_model = body.default_model;
            if (body.requests_per_minute !== undefined) updateData.requests_per_minute = body.requests_per_minute;
            if (body.tokens_per_day !== undefined) updateData.tokens_per_day = body.tokens_per_day;
            if (body.concurrent_requests !== undefined) updateData.concurrent_requests = body.concurrent_requests;
            if (body.enable_fallback !== undefined) updateData.enable_fallback = body.enable_fallback;
            if (body.fallback_provider !== undefined) updateData.fallback_provider = body.fallback_provider;
            if (body.max_retries_before_fallback !== undefined) updateData.max_retries_before_fallback = body.max_retries_before_fallback;
            if (body.circuit_breaker_enabled !== undefined) updateData.circuit_breaker_enabled = body.circuit_breaker_enabled;
            if (body.circuit_breaker_failure_threshold !== undefined) updateData.circuit_breaker_failure_threshold = body.circuit_breaker_failure_threshold;
            if (body.circuit_breaker_timeout_seconds !== undefined) updateData.circuit_breaker_timeout_seconds = body.circuit_breaker_timeout_seconds;
            if (body.fallback_model !== undefined) updateData.fallback_model = body.fallback_model;
            if (body.ragmetrics_enabled !== undefined) updateData.ragmetrics_enabled = body.ragmetrics_enabled;
            if (body.ragmetrics_api_key !== undefined) updateData.ragmetrics_api_key = body.ragmetrics_api_key;
            if (body.ragmetrics_config !== undefined) updateData.ragmetrics_config = body.ragmetrics_config;

            const { error: updateError } = await supabaseAdmin
                .from("project_settings")
                .update(updateData)
                .eq("project_id", projectId);

            if (updateError) {
                console.error("Error updating settings:", updateError);
                return NextResponse.json(
                    { error: "Failed to update settings" },
                    { status: 500 }
                );
            }
        } else {
            const { error: insertError } = await supabaseAdmin
                .from("project_settings")
                .insert({
                    project_id: projectId,
                    default_provider: body.default_provider || "openai",
                    default_model: body.default_model || "gpt-4o",
                    requests_per_minute: body.requests_per_minute || 60,
                    tokens_per_day: body.tokens_per_day || 1000000,
                    concurrent_requests: body.concurrent_requests || 10,
                    enable_fallback: body.enable_fallback ?? true,
                    fallback_provider: body.fallback_provider || "anthropic",
                    max_retries_before_fallback: body.max_retries_before_fallback || 3,
                    circuit_breaker_enabled: body.circuit_breaker_enabled ?? true,
                    circuit_breaker_failure_threshold: body.circuit_breaker_failure_threshold || 5,
                    circuit_breaker_timeout_seconds: body.circuit_breaker_timeout_seconds || 60,
                    fallback_model: body.fallback_model || null,
                    ragmetrics_enabled: body.ragmetrics_enabled ?? false,
                    ragmetrics_api_key: body.ragmetrics_api_key || null,
                    ragmetrics_config: body.ragmetrics_config || {},
                });

            if (insertError) {
                console.error("Error inserting settings:", insertError);
                return NextResponse.json(
                    { error: "Failed to save settings" },
                    { status: 500 }
                );
            }
        }

        writeAuditLog({
            organizationId: project.organization_id,
            projectId,
            category: 'settings',
            action: 'updated',
            resourceType: 'project_settings',
            resourceId: projectId,
            actorIp: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
            actorType: 'user',
            description: 'Updated project settings',
            metadata: { changes: body },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Error in settings PATCH:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    try {
        const { projectId } = await params;
        const projectAccess = await requireProjectAccess(projectId);
        if (!projectAccess.ok) return projectAccess.response;

        const { data: settings, error } = await supabaseAdmin
            .from("project_settings")
            .select("*")
            .eq("project_id", projectId)
            .single();

        if (error && error.code !== "PGRST116") {
            console.error("Error fetching settings:", error);
            return NextResponse.json(
                { error: "Failed to fetch settings" },
                { status: 500 }
            );
        }
        return NextResponse.json({
            settings: settings || {
                default_provider: "openai",
                default_model: "gpt-4o",
                requests_per_minute: 60,
                tokens_per_day: 1000000,
                concurrent_requests: 10,
                enable_fallback: true,
                fallback_provider: "anthropic",
                max_retries_before_fallback: 3,
                circuit_breaker_enabled: true,
                circuit_breaker_failure_threshold: 5,
                circuit_breaker_timeout_seconds: 60,
                fallback_model: null,
                ragmetrics_enabled: false,
                ragmetrics_api_key: null,
            },
        });
    } catch (error) {
        console.error("Error in settings GET:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
