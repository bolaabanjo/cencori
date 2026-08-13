import { describe, expect, it } from "vitest";
import { threadsWithPersistedTurns } from "@/lib/basecode-data";

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
