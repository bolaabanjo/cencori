import { NextRequest, NextResponse } from 'next/server';
import { sendChatRequest } from '@/lib/gemini';

const SYSTEM_PROMPT = `You are Cencori AI, an intelligent assistant for the Cencori platform.

Cencori is the infrastructure for AI production. We provide a complete platform for shipping AI:
- AI Gateway: Connect to multiple AI providers (OpenAI, Anthropic, Google, etc.) with security and observability
- Compute: Run AI workloads with serverless functions and GPU access
- Workflows: Orchestrate AI pipelines with visual builders
- Security: PII detection, prompt injection protection, content moderation
- Observability: Monitor usage, costs, and analytics across all AI operations

You help users with:
- Getting started with Cencori
- Understanding platform features and SDK integration
- Troubleshooting issues
- Best practices for AI infrastructure

Keep responses concise, helpful, and focused on Cencori. If asked about unrelated topics, politely redirect to Cencori-related help.`;

export async function POST(req: NextRequest) {
    try {
        const { question } = await req.json();

        if (!question || typeof question !== 'string') {
            return NextResponse.json(
                { error: 'Question is required' },
                { status: 400 }
            );
        }

        const response = await sendChatRequest({
            messages: [
                {
                    role: 'user',
                    parts: [{ text: `${SYSTEM_PROMPT}\n\nUser question: ${question}` }],
                },
            ],
            model: 'groq/compound',
            temperature: 0.7,
            maxOutputTokens: 1024,
        });

        return NextResponse.json({
            answer: response.text,
            tokens: response.totalTokens,
        });
    } catch (error) {
        console.error('[Ask AI] Error:', error);
        return NextResponse.json(
            { error: 'Failed to get AI response' },
            { status: 500 }
        );
    }
}
