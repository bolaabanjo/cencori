import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ScanIssue } from "@/packages/scan/src/scanner/core";

vi.mock("@/lib/scan/ai-client", () => ({
    generateWithFallback: vi.fn(),
}));

import { generateWithFallback } from "@/lib/scan/ai-client";
import { generateAiCodeQualityIssues } from "@/lib/scan/ai-quality";

const mockedGenerateWithFallback = vi.mocked(generateWithFallback);
const ENV_BACKUP = { ...process.env };

function restoreProviderEnv() {
    process.env.CEREBRAS_API_KEY = ENV_BACKUP.CEREBRAS_API_KEY;
    process.env.GROQ_API_KEY = ENV_BACKUP.GROQ_API_KEY;
    process.env.GOOGLE_AI_API_KEY = ENV_BACKUP.GOOGLE_AI_API_KEY;
    process.env.GEMINI_API_KEY = ENV_BACKUP.GEMINI_API_KEY;
}

describe("generateAiCodeQualityIssues", () => {
    beforeEach(() => {
        restoreProviderEnv();
        mockedGenerateWithFallback.mockReset();
    });

    afterEach(() => {
        restoreProviderEnv();
    });

    test("returns warning when no provider key is configured", async () => {
        delete process.env.CEREBRAS_API_KEY;
        delete process.env.GROQ_API_KEY;
        delete process.env.GOOGLE_AI_API_KEY;
        delete process.env.GEMINI_API_KEY;

        const result = await generateAiCodeQualityIssues({
            repository: "org/repo",
            scannedFiles: [{ path: "src/a.ts", content: "export const a = 1;" }],
            existingIssues: [],
        });

        expect(result.issues).toHaveLength(0);
        expect(result.evaluatedFiles).toBe(0);
        expect(result.warning).toContain("no AI provider keys");
        expect(mockedGenerateWithFallback).not.toHaveBeenCalled();
    });

    test("normalizes and deduplicates valid AI issues", async () => {
        process.env.GEMINI_API_KEY = "test-key";

        const existingIssues: ScanIssue[] = [
            {
                type: "code_quality",
                severity: "low",
                category: "maintainability",
                name: "Existing",
                file: "src/a.ts",
                line: 3,
                column: 1,
                match: "existing",
            },
        ];

        mockedGenerateWithFallback.mockResolvedValue({
            provider: "gemini",
            model: "gemini-2.5-flash",
            text: JSON.stringify({
                issues: [
                    {
                        file: "src/a.ts",
                        line: 3,
                        severity: "low",
                        category: "maintainability",
                        name: "Existing",
                        match: "duplicate",
                        description: "duplicate",
                    },
                    {
                        file: "src/a.ts",
                        line: 2,
                        severity: "medium",
                        category: "complexity",
                        name: "Long Conditional Chain",
                        match: "if (a && b && c && d)",
                        description: "Consider extracting decision logic into named helpers.",
                    },
                    {
                        file: "src/missing.ts",
                        line: 1,
                        severity: "medium",
                        category: "complexity",
                        name: "Missing File",
                        match: "x",
                        description: "y",
                    },
                ],
            }),
        });

        const result = await generateAiCodeQualityIssues({
            repository: "org/repo",
            scannedFiles: [
                { path: "src/a.ts", content: "const a = 1;\nif (a && b && c && d) {}\nconst z = 4;" },
                { path: "README.md", content: "# docs" },
            ],
            existingIssues,
        });

        expect(result.warning).toBeUndefined();
        expect(result.provider).toBe("gemini");
        expect(result.model).toBe("gemini-2.5-flash");
        expect(result.evaluatedFiles).toBe(1);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0]).toMatchObject({
            type: "code_quality",
            file: "src/a.ts",
            line: 2,
            severity: "medium",
            category: "complexity",
            name: "Long Conditional Chain",
        });
    });

    test("returns warning when AI format is invalid", async () => {
        process.env.GROQ_API_KEY = "test-key";
        mockedGenerateWithFallback.mockResolvedValue({
            provider: "groq",
            model: "groq/compound",
            text: "not-json",
        });

        const result = await generateAiCodeQualityIssues({
            repository: "org/repo",
            scannedFiles: [{ path: "src/a.ts", content: "const a: any = 1;" }],
            existingIssues: [],
        });

        expect(result.issues).toHaveLength(0);
        expect(result.warning).toContain("invalid format");
    });
});
