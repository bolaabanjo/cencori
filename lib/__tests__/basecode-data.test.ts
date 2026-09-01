import { describe, expect, it } from "vitest";
import { readThreadUsageEntries, threadsWithPersistedTurns } from "@/lib/basecode-data";

describe("threadsWithPersistedTurns", () => {
  it("omits task shells that never persisted a first turn", () => {
    const threads = [
      { id: "thread-with-turn", title: "Build it" },
      { id: "orphaned-thread", title: "Hello" },
    ];

    expect(threadsWithPersistedTurns(threads, new Set(["thread-with-turn"]))).toEqual([
      threads[0],
    ]);
  });
});

describe("Basecode thread usage payloads", () => {
  const tokens = {
    totalTokens: 14_400,
    inputTokens: 12_000,
    cachedInputTokens: 400,
    cacheWriteInputTokens: 0,
    outputTokens: 1_500,
    reasoningOutputTokens: 900,
  };

  it("reads a thread's running total, which is what both writers send", () => {
    expect(readThreadUsageEntries([{ threadId: "th-1", tokens, updatedAt: 42 }])).toEqual([
      { threadId: "th-1", tokens, updatedAt: 42 },
    ]);
  });

  it("rejects a partial breakdown, which would store as a total with holes in it", () => {
    expect(readThreadUsageEntries([{ threadId: "th-1", tokens: { totalTokens: 14_400 } }])).toEqual(
      [],
    );
  });

  it("rejects counts that are negative or not numbers", () => {
    expect(
      readThreadUsageEntries([{ threadId: "th-1", tokens: { ...tokens, outputTokens: -1 } }]),
    ).toEqual([]);
    expect(
      readThreadUsageEntries([{ threadId: "th-1", tokens: { ...tokens, inputTokens: "lots" } }]),
    ).toEqual([]);
  });

  it("drops a bad entry without costing the device the rest of its history", () => {
    const entries = readThreadUsageEntries([
      { threadId: "th-1", tokens, updatedAt: 1 },
      { threadId: "", tokens, updatedAt: 2 },
      { threadId: "th-3", tokens, updatedAt: 3 },
    ]);

    expect(entries.map((entry) => entry.threadId)).toEqual(["th-1", "th-3"]);
  });

  it("stamps an entry that arrived without a clock, so the replace still orders", () => {
    const [entry] = readThreadUsageEntries([{ threadId: "th-1", tokens }]);

    expect(entry?.updatedAt).toBeGreaterThan(0);
  });

  it("caps a batch, so one device cannot file an unbounded import", () => {
    const many = Array.from({ length: 600 }, (_, index) => ({
      threadId: `th-${index}`,
      tokens,
      updatedAt: index,
    }));

    expect(readThreadUsageEntries(many)).toHaveLength(500);
  });

  it("ignores anything that is not a list of entries", () => {
    expect(readThreadUsageEntries(null)).toEqual([]);
    expect(readThreadUsageEntries({ threadId: "th-1" })).toEqual([]);
    expect(readThreadUsageEntries(["th-1"])).toEqual([]);
  });
});
