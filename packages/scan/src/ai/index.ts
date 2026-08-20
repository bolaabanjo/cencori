/**
 * AI-powered analysis and auto-fix module
 * Uses Cencori API for LLM intelligence
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { ScanIssue } from '../scanner/index.js';

const CENCORI_API_URL = 'https://api.cencori.com/v1';
const CONFIG_FILE = '.cencorirc';

export interface AnalysisResult {
    issue: ScanIssue;
    isFalsePositive: boolean;
    confidence: number;
    reason: string;
}

export interface FixResult {
    issue: ScanIssue;
    originalCode: string;
    fixedCode: string;
    explanation: string;
    applied: boolean;
}

/**
 * Get the config file path
 */
function getConfigPath(): string {
    return path.join(os.homedir(), CONFIG_FILE);
}

/**
 * Load API key from config file
 */
function loadApiKeyFromConfig(): string | undefined {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
                if (line.startsWith('api_key=')) {
                    return line.slice('api_key='.length).trim();
                }
            }
        }
    } catch {
        // Ignore config read errors
    }
    return undefined;
}

/**
 * Save API key to config file
 */
export function saveApiKey(apiKey: string): void {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, `api_key=${apiKey}\n`, { mode: 0o600 });
}

/**
 * Get API key (from env var, config file, or undefined)
 */
export function getApiKey(): string | undefined {
    // Priority: env var > config file
    return process.env.CENCORI_API_KEY || loadApiKeyFromConfig();
}

/**
 * Set API key for current session (used after prompting user)
 */
let sessionApiKey: string | undefined;

export function setSessionApiKey(apiKey: string): void {
    sessionApiKey = apiKey;
}

/**
 * Get API key including session key
 */
function getEffectiveApiKey(): string | undefined {
    return sessionApiKey || getApiKey();
}

/**
 * Check if AI features are available
 */
export function isAIAvailable(): boolean {
    return !!getEffectiveApiKey();
}

/**
 * Validate API key by making a test request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
    try {
        const response = await fetch(`${CENCORI_API_URL}/models`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Analyze issues with AI to filter false positives
 */
export async function analyzeIssues(
    issues: ScanIssue[],
    fileContents: Map<string, string>
): Promise<AnalysisResult[]> {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
        throw new Error('No API key available');
    }

    const results: AnalysisResult[] = [];

    for (const issue of issues) {
        const content = fileContents.get(issue.file) || '';
        const lines = content.split('\n');
        const startLine = Math.max(0, issue.line - 3);
        const endLine = Math.min(lines.length, issue.line + 3);
        const context = lines.slice(startLine, endLine).join('\n');

        try {
            const response = await fetch(`${CENCORI_API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    messages: [
                        {
                            role: 'system',
                            content: `You are a security analyst. Analyze code findings and determine if they are real security issues or false positives. Respond in JSON format: {"isFalsePositive": boolean, "confidence": number (0-100), "reason": "brief explanation"}`,
                        },
                        {
                            role: 'user',
                            content: `Analyze this security finding:
Type: ${issue.type}
Name: ${issue.name}
Match: ${issue.match}
File: ${issue.file}:${issue.line}
Context:
\`\`\`
${context}
\`\`\`

Is this a real security issue or a false positive (e.g., test data, example code, documentation)?`,
                        },
                    ],
                    temperature: 0,
                    max_tokens: 150,
                }),
            });

            if (!response.ok) {
                throw new Error(`API error: ${response.status}`);
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
            };
            const content_response = data.choices[0]?.message?.content || '{}';

            // Parse JSON response
            const parsed = JSON.parse(content_response);
            results.push({
                issue,
                isFalsePositive: parsed.isFalsePositive || false,
                confidence: parsed.confidence || 50,
                reason: parsed.reason || 'Unable to analyze',
            });
        } catch {
            // If analysis fails, assume it's a real issue
            results.push({
                issue,
                isFalsePositive: false,
                confidence: 50,
                reason: 'Analysis failed - treating as potential issue',
            });
        }
    }

    return results;
}

/**
 * Generate fixes for issues using AI
 */
export async function generateFixes(
    issues: ScanIssue[],
    fileContents: Map<string, string>
): Promise<FixResult[]> {
    const apiKey = getEffectiveApiKey();
    if (!apiKey) {
        throw new Error('No API key available');
    }

    const results: FixResult[] = [];

    for (const issue of issues) {
        const content = fileContents.get(issue.file) || '';
        const lines = content.split('\n');
        const startLine = Math.max(0, issue.line - 5);
        const endLine = Math.min(lines.length, issue.line + 5);
        const codeSnippet = lines.slice(startLine, endLine).join('\n');

        try {
            const response = await fetch(`${CENCORI_API_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'groq/compound-mini', // Use Groq (generous free tier)
                    messages: [
                        {
                            role: 'system',
                            content: `You are a security engineer fixing code vulnerabilities. Generate secure code fixes.

IMPORTANT: Respond ONLY with valid JSON in this exact format:
{"fixedCode": "the complete fixed code snippet", "explanation": "brief explanation of what was changed"}

Rules:
- For hardcoded secrets: Replace with environment variables (process.env.VAR_NAME)
- For XSS vulnerabilities: Add proper escaping/sanitization
- For SQL injection: Use parameterized queries
- For exposed routes: Add authentication middleware
- Keep the same code structure, only fix the security issue`,
                        },
                        {
                            role: 'user',
                            content: `Fix this security issue:
Type: ${issue.type}
Name: ${issue.name}
Severity: ${issue.severity}
File: ${issue.file}:${issue.line}

Code to fix:
\`\`\`
${codeSnippet}
\`\`\`

Respond with JSON only.`,
                        },
                    ],
                    temperature: 0,
                    max_tokens: 1000,
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[AI] API error for ${issue.file}:${issue.line}: ${response.status} - ${errorText}`);
                results.push({
                    issue,
                    originalCode: codeSnippet,
                    fixedCode: codeSnippet, // Same as original = no fix
                    explanation: `API error: ${response.status}`,
                    applied: false,
                });
                continue;
            }

            const data = await response.json() as {
                choices: Array<{ message: { content: string } }>;
                error?: { message: string };
            };

            if (data.error) {
                console.error(`[AI] API returned error: ${data.error.message}`);
                results.push({
                    issue,
                    originalCode: codeSnippet,
                    fixedCode: codeSnippet,
                    explanation: `AI error: ${data.error.message}`,
                    applied: false,
                });
                continue;
            }

            const content_response = data.choices[0]?.message?.content || '';

            // Try to extract JSON from the response (handle markdown code blocks)
            let jsonStr = content_response;
            const jsonMatch = content_response.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1].trim();
            }

            try {
                const parsed = JSON.parse(jsonStr);
                const fixedCode = parsed.fixedCode || parsed.fixed_code || '';

                if (fixedCode && fixedCode !== codeSnippet) {
                    results.push({
                        issue,
                        originalCode: codeSnippet,
                        fixedCode: fixedCode,
                        explanation: parsed.explanation || 'Security fix applied',
                        applied: false,
                    });
                } else {
                    // AI couldn't generate a different fix
                    results.push({
                        issue,
                        originalCode: codeSnippet,
                        fixedCode: codeSnippet,
                        explanation: 'AI could not generate a fix for this issue',
                        applied: false,
                    });
                }
            } catch (parseError) {
                console.error(`[AI] JSON parse error for ${issue.file}:${issue.line}:`, parseError);
                results.push({
                    issue,
                    originalCode: codeSnippet,
                    fixedCode: codeSnippet,
                    explanation: 'Failed to parse AI response',
                    applied: false,
                });
            }
        } catch (error) {
            console.error(`[AI] Request failed for ${issue.file}:${issue.line}:`, error);
            results.push({
                issue,
                originalCode: codeSnippet,
                fixedCode: codeSnippet,
                explanation: `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
                applied: false,
            });
        }
    }

    return results;
}

/**
 * Apply fixes to files
 */
export async function applyFixes(
    fixes: FixResult[],
    fileContents: Map<string, string>
): Promise<FixResult[]> {
    for (const fix of fixes) {
        if (fix.fixedCode === fix.originalCode) {
            continue;
        }

        const content = fileContents.get(fix.issue.file);
        if (!content) {
            continue;
        }

        // Replace the original code with the fixed code
        const newContent = content.replace(fix.originalCode, fix.fixedCode);

        if (newContent !== content) {
            const filePath = path.resolve(fix.issue.file);
            fs.writeFileSync(filePath, newContent, 'utf-8');
            fix.applied = true;
        }
    }

    return fixes;
}
