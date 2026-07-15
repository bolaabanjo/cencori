import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabaseAdmin';
import { decryptApiKey } from '@/lib/encryption';
import { requireTierFeatureForProject } from '@/lib/require-tier-feature';
import { safeOutboundFetch } from '@/lib/security/outbound-url';

interface TestRequest {
    provider_id?: string;
    base_url?: string;
    api_key?: string;
    api_format?: 'openai' | 'anthropic';
    model?: string;
}

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ projectId: string }> }
) {
    const { projectId } = await params;
    const supabase = createAdminClient();

    try {
        const { data: project, error: projectError } = await supabase
            .from('projects')
            .select('id')
            .eq('id', projectId)
            .single();

        if (projectError || !project) {
            return NextResponse.json(
                { error: 'Project not found', success: false },
                { status: 404 }
            );
        }

        const gate = await requireTierFeatureForProject(projectId, 'customProviders');
        if (gate) return gate;

        const body: TestRequest = await req.json();

        let baseUrl: string;
        let apiKey: string;
        let apiFormat: 'openai' | 'anthropic';
        let testModel: string;

        if (body.provider_id) {
            const { data: provider, error } = await supabase
                .from('custom_providers')
                .select('*, custom_models(*)')
                .eq('id', body.provider_id)
                .eq('project_id', projectId)
                .single();

            if (error || !provider) {
                return NextResponse.json(
                    { error: 'Custom provider not found', success: false },
                    { status: 404 }
                );
            }

            const { data: project } = await supabase
                .from('projects')
                .select('organization_id')
                .eq('id', projectId)
                .single();

            if (!project) {
                return NextResponse.json(
                    { error: 'Project not found', success: false },
                    { status: 404 }
                );
            }

            baseUrl = provider.base_url;
            apiKey = provider.encrypted_api_key
                ? decryptApiKey(provider.encrypted_api_key, project.organization_id)
                : '';
            apiFormat = provider.api_format;
            testModel = provider.custom_models?.[0]?.model_name || body.model || 'gpt-3.5-turbo';
        } else {
            if (!body.base_url) {
                return NextResponse.json(
                    { error: 'base_url is required', success: false },
                    { status: 400 }
                );
            }

            baseUrl = body.base_url;
            apiKey = body.api_key || '';
            apiFormat = body.api_format || 'openai';
            testModel = body.model || 'gpt-3.5-turbo';
        }

        const startTime = Date.now();

        if (apiFormat === 'openai') {
            const response = await safeOutboundFetch(`${baseUrl}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: testModel,
                    messages: [{ role: 'user', content: 'Say "test" and nothing else.' }],
                    max_tokens: 5,
                }),
                signal: AbortSignal.timeout(30000),
            }, { maxRedirects: 0 });

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errorText = await response.text();
                return NextResponse.json({
                    success: false,
                    error: `Provider returned ${response.status}: ${errorText.substring(0, 200)}`,
                    latency_ms: latency,
                });
            }

            const data = await response.json();

            return NextResponse.json({
                success: true,
                message: 'Connection successful',
                latency_ms: latency,
                response: {
                    model: data.model || testModel,
                    content: data.choices?.[0]?.message?.content || null,
                    usage: data.usage || null,
                },
            });

        } else if (apiFormat === 'anthropic') {
            const response = await safeOutboundFetch(`${baseUrl}/messages`, {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json',
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({
                    model: testModel,
                    messages: [{ role: 'user', content: 'Say "test" and nothing else.' }],
                    max_tokens: 5,
                }),
                signal: AbortSignal.timeout(30000),
            }, { maxRedirects: 0 });

            const latency = Date.now() - startTime;

            if (!response.ok) {
                const errorText = await response.text();
                return NextResponse.json({
                    success: false,
                    error: `Provider returned ${response.status}: ${errorText.substring(0, 200)}`,
                    latency_ms: latency,
                });
            }

            const data = await response.json();

            return NextResponse.json({
                success: true,
                message: 'Connection successful',
                latency_ms: latency,
                response: {
                    model: data.model || testModel,
                    content: data.content?.[0]?.text || null,
                    usage: data.usage || null,
                },
            });
        }

        return NextResponse.json(
            { error: 'Unsupported API format', success: false },
            { status: 400 }
        );

    } catch (error) {
        console.error('[Custom Provider Test] Error:', error);

        if (error instanceof Error) {
            if (error.name === 'TimeoutError' || error.name === 'AbortError') {
                return NextResponse.json({
                    success: false,
                    error: 'Connection timed out after 30 seconds',
                });
            }

            return NextResponse.json({
                success: false,
                error: error.message,
            });
        }

        return NextResponse.json(
            { error: 'Internal server error', success: false },
            { status: 500 }
        );
    }
}
