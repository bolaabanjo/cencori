import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Arcie counterpart of /api/docs/ai — same streaming contract, but grounded in
// content/arcie and speaking as the Arcie expert.
const DOCS_DIR = path.join(process.cwd(), "content", "arcie");

// Cache the docs in memory to avoid reading disk on every request
// In a serverless env this might be re-executed, but it's fast enough.
let cachedAllDocs: string | null = null;

function getAllDocsContent(): string {
    if (cachedAllDocs) return cachedAllDocs;

    const files = getMdxFiles(DOCS_DIR);
    let allContent = "";

    for (const file of files) {
        const filePath = path.join(DOCS_DIR, file);
        const fileContents = fs.readFileSync(filePath, "utf-8");
        const { data, content } = matter(fileContents);
        const slug = filePathToSlug(file);
        const title = data.title || slug;

        // Clean content slightly to save tokens
        const cleanContent = content
            // Remove excessive newlines
            .replace(/\n{3,}/g, "\n\n")
            // Remove import statements (usually not needed for context)
            .replace(/^import\s+.*;/gm, "")
            .trim();

        allContent += `\n\n--- DOCUMENT START: ${title} (Slug: /arcie/docs/${slug}) ---\n${cleanContent}\n--- DOCUMENT END ---\n`;
    }

    cachedAllDocs = allContent;
    return allContent;
}

function getMdxFiles(dir: string, basePath = ""): string[] {
    if (!fs.existsSync(dir)) return [];
    const files: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.join(basePath, entry.name);
        if (entry.isDirectory()) {
            files.push(...getMdxFiles(fullPath, relativePath));
        } else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
            files.push(relativePath);
        }
    }
    return files;
}

function filePathToSlug(filePath: string): string {
    return filePath
        .replace(/\.(mdx|md)$/, "")
        .replace(/\/_index$/, "")
        .replace(/\/index$/, "")
        .replace(/^\//, "");
}

function getCurrentPageDoc(currentPage: string): { title: string; content: string; slug: string } | null {
    if (!currentPage) return null;

    // Clean the path to get a pure slug
    let currentSlug = currentPage
        .split("/arcie/docs")
        .pop()
        ?.split(/[?#]/)[0]
        ?.replace(/\/$/, "")
        ?.replace(/^\//, "") || "";

    // The docs root (/arcie/docs) is content/arcie/index.mdx
    if (!currentSlug) currentSlug = "index";

    const files = getMdxFiles(DOCS_DIR);
    const currentFile = files.find(f => filePathToSlug(f) === currentSlug);

    if (currentFile) {
        const fileContents = fs.readFileSync(path.join(DOCS_DIR, currentFile), "utf-8");
        const { data, content } = matter(fileContents);
        return {
            title: data.title || currentSlug,
            content: content,
            slug: currentSlug
        };
    }
    return null;
}

const GLOBAL_SYSTEM_PROMPT = `You are Arcie AI, the expert guide for Arcie — Cencori's open-source framework for building production agents as files.
You have access to the ENTIRE Arcie documentation.

Your goal is to be helpful, concise, and natural. Talk like a senior engineer who knows the framework inside out.

Guidelines:
1. **Context Awareness**: The user is currently viewing a specific page. If they ask "what is this?" or "how do I use this?", refer to the "CURRENT PAGE CONTEXT" first.
2. **Holistic Knowledge**: You know everything about Arcie (project layout, agents, tools, skills, hooks, channels, schedules, subagents, policies, sessions, the CLI, and the Cencori integration). Connect concepts where appropriate.
3. **Code First**: When asked how to do something, provide TypeScript code snippets and file examples immediately.
4. **Natural Tone**: Don't say "According to the documentation...". Just answer directly. Say "You can use..." instead of "The documentation states that...".
5. **Accuracy**: Only invent code if it's a logical combination of existing features. Do not hallucinate APIs not present in the docs.

If the user asks about something not in the docs, politely explain that it might not be supported yet or suggest a workaround using existing features.`;

const PAGE_SYSTEM_PROMPT = `You are Arcie AI, answering questions STRICTLY about the documentation page the user is currently viewing.

You ONLY have access to the content of this one specific page. Do not reference, invent, or imply knowledge from any other page.

Guidelines:
1. **Strict Scope**: Only answer based on the page content provided. If the answer isn't on this page, say so clearly.
2. **Code First**: Reproduce and explain code snippets from the page when relevant.
3. **Natural Tone**: Answer directly as a senior engineer explaining this specific topic.
4. **Out-of-scope questions**: If the user asks about something not covered on this page, tell them to use the global "Ask AI" in the top nav for broader questions.

Do not hallucinate content that isn't in the provided page.`;

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { messages, currentPage, userName, scope = "global" } = body;

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json({ error: "Messages are required" }, { status: 400 });
        }

        const currentPageDoc = getCurrentPageDoc(currentPage);

        let contextPrompt = "";
        let systemPrompt: string;

        if (scope === "page") {
            // Strict page scope — only include this page's content
            systemPrompt = PAGE_SYSTEM_PROMPT;
            if (currentPageDoc) {
                contextPrompt += `=== 📄 PAGE CONTENT ===\n`;
                contextPrompt += `Title: ${currentPageDoc.title}\n`;
                contextPrompt += `URL: /arcie/docs/${currentPageDoc.slug}\n`;
                contextPrompt += `Content:\n${currentPageDoc.content}\n`;
                contextPrompt += `=== END PAGE CONTENT ===\n`;
            } else {
                contextPrompt += `No page content available.\n`;
            }
        } else {
            // Global scope — full docs + optional current page highlight
            systemPrompt = GLOBAL_SYSTEM_PROMPT;
            if (currentPageDoc) {
                contextPrompt += `\n=== 📍 CURRENT PAGE CONTEXT (User is reading this right now) ===\n`;
                contextPrompt += `Title: ${currentPageDoc.title}\n`;
                contextPrompt += `Slug: ${currentPageDoc.slug}\n`;
                contextPrompt += `Content:\n${currentPageDoc.content}\n`;
                contextPrompt += `=== END CURRENT PAGE ===\n\n`;
            }
            const allDocs = getAllDocsContent();
            contextPrompt += `=== 📚 FULL ARCIE DOCUMENTATION ===\n${allDocs}\n=== END DOCUMENTATION ===\n`;
        }

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            systemInstruction: systemPrompt
        });

        // Add context to the last message or as a preamble
        const lastMessage = messages[messages.length - 1];

        let userContext = "";
        if (userName) {
            userContext = `\nUSER CONTEXT: The user's name is "${userName}". You can use their name naturally (e.g. "Hi ${userName}", "Sure ${userName}") but don't overdo it. Make them feel personally welcomed. DO not mention their name all the time, but know their name. you can mention their name once or twice max through out the interaction, but not 3 times or 4 times.`;
        }

        const userPrompt = `Reference Documentation:\n${contextPrompt}${userContext}\n\nUser Question: ${lastMessage.content}`;

        // Create chat history properly (excluding the modified last message)
        const history = messages.slice(0, -1).map((m: { role: string; content: string }) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }]
        }));

        const chat = model.startChat({
            history: history,
            generationConfig: {
                maxOutputTokens: 2000,
                temperature: 0.5,
            }
        });

        const result = await chat.sendMessageStream(userPrompt);
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    for await (const chunk of result.stream) {
                        const chunkText = chunk.text();
                        if (chunkText) {
                            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunkText })}\n\n`));
                        }
                    }
                    controller.enqueue(encoder.encode("data: [DONE]\n\n"));
                    controller.close();
                } catch (error) {
                    console.error("[Arcie Docs AI] Error:", error);
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Failed to generate response" })}\n\n`));
                    controller.close();
                }
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        });
    } catch (error) {
        console.error("[Arcie Docs AI] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
