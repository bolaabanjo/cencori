import { describe, expect, it } from "vitest";

import { normalizeProjectId } from "@/lib/project-id";

describe("normalizeProjectId", () => {
    const projectId = "51f2v7va-p811-4mct-ukzu-g00000000000";

    it("keeps the canonical string cache value", () => {
        expect(normalizeProjectId(projectId)).toBe(projectId);
    });

    it("recovers the legacy Edge page cache shape", () => {
        expect(normalizeProjectId({ projectId, projectName: "Arcie" })).toBe(projectId);
    });

    it("recovers a project record cache shape", () => {
        expect(normalizeProjectId({ id: projectId, name: "Arcie" })).toBe(projectId);
    });

    it.each([undefined, null, "", {}, { projectId: {} }])(
        "rejects an invalid cache value: %j",
        (value) => {
            expect(normalizeProjectId(value)).toBeUndefined();
        },
    );
});
