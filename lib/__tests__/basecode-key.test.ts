import { beforeEach, describe, expect, it } from "vitest";
import { issueBasecodeApiKey } from "@/lib/basecode-key";

/**
 * A Supabase double that is thenable at any point in the chain, because the code under test awaits
 * some queries directly (`.limit(1)`) and terminates others (`.single()`). Every call is recorded
 * so a test can assert what was written, not only what came back.
 */
type Result = { data?: unknown; error?: unknown };

type Recorded = { table: string; op: string; payload?: unknown };

function createAdminDouble(results: Record<string, Result | Result[]>) {
  const calls: Recorded[] = [];
  const queues = new Map<string, Result[]>(
    Object.entries(results).map(([key, value]) => [key, Array.isArray(value) ? [...value] : [value]]),
  );

  const take = (key: string): Result => {
    const queue = queues.get(key);
    if (!queue?.length) return { data: null, error: null };
    return queue.length === 1 ? queue[0] : (queue.shift() as Result);
  };

  const chain = (table: string, op: string, payload?: unknown) => {
    calls.push({ table, op, payload });
    const settle = () => take(`${table}.${op}`);
    const node: Record<string, unknown> = {
      then: (resolve: (value: Result) => unknown) => Promise.resolve(settle()).then(resolve),
      single: async () => settle(),
      maybeSingle: async () => settle(),
    };
    for (const method of ["select", "eq", "in", "is", "order", "limit", "not"]) {
      node[method] = () => node;
    }
    return node;
  };

  return {
    calls,
    admin: {
      from: (table: string) => ({
        select: () => chain(table, "select"),
        insert: (payload: unknown) => chain(table, "insert", payload),
        update: (payload: unknown) => chain(table, "update", payload),
      }),
    } as never,
  };
}

const USER = "user-1";

beforeEach(() => {
  // Failures are logged rather than thrown; keep the suite output clean.
  console.error = () => {};
});

describe("issueBasecodeApiKey", () => {
  it("issues a secret key against a project the user already owns", async () => {
    const { admin, calls } = createAdminDouble({
      "projects.select": { data: [{ id: "project-1" }] },
      "api_keys.insert": { error: null },
    });

    const key = await issueBasecodeApiKey(admin, USER);

    expect(key).toMatch(/^csk_[0-9a-f]{48}$/);
    const insert = calls.find((call) => call.table === "api_keys" && call.op === "insert");
    expect(insert?.payload).toMatchObject({
      project_id: "project-1",
      created_by: USER,
      environment: "production",
      key_type: "secret",
    });
  });

  /** The raw key is unrecoverable once hashed, so only its hash may be stored. */
  it("stores the hash and a prefix, never the key itself", async () => {
    const { admin, calls } = createAdminDouble({
      "projects.select": { data: [{ id: "project-1" }] },
      "api_keys.insert": { error: null },
    });

    const key = await issueBasecodeApiKey(admin, USER);
    const payload = calls.find((call) => call.op === "insert" && call.table === "api_keys")
      ?.payload as Record<string, string>;

    expect(payload.key_hash).toHaveLength(64);
    expect(JSON.stringify(payload)).not.toContain(key as string);
    expect(payload.key_prefix.endsWith("...")).toBe(true);
  });

  /** Each sign-in mints a new key, so the previous one must not stay live. */
  it("revokes the previous desktop key before issuing another", async () => {
    const { admin, calls } = createAdminDouble({
      "projects.select": { data: [{ id: "project-1" }] },
      "api_keys.insert": { error: null },
    });

    await issueBasecodeApiKey(admin, USER);

    const update = calls.find((call) => call.table === "api_keys" && call.op === "update");
    expect(update?.payload).toMatchObject({ revoked_at: expect.any(String) });
    expect(calls.indexOf(update as Recorded)).toBeLessThan(
      calls.findIndex((call) => call.table === "api_keys" && call.op === "insert"),
    );
  });

  it("creates a project when the user has an organization but no project", async () => {
    const { admin, calls } = createAdminDouble({
      // Owned lookup, membership lookup, shared lookup — all empty.
      "projects.select": [{ data: [] }, { data: [] }],
      "organization_members.select": { data: [] },
      "organizations.select": { data: [{ id: "org-1" }] },
      "projects.insert": { data: { id: "project-new" }, error: null },
      "api_keys.insert": { error: null },
    });

    const key = await issueBasecodeApiKey(admin, USER);

    expect(key).toMatch(/^csk_/);
    expect(calls.find((call) => call.table === "projects" && call.op === "insert")?.payload)
      .toMatchObject({ organization_id: "org-1", visibility: "private" });
  });

  /**
   * Sign-in works today and has to keep working: a user who cannot be given a key still gets their
   * session and loses inference, not the app. Failing the exchange would take everything.
   */
  it("returns null rather than throwing when there is no organization", async () => {
    const { admin, calls } = createAdminDouble({
      "projects.select": { data: [] },
      "organization_members.select": { data: [] },
      "organizations.select": { data: [] },
    });

    await expect(issueBasecodeApiKey(admin, USER)).resolves.toBeNull();
    expect(calls.some((call) => call.table === "api_keys" && call.op === "insert")).toBe(false);
  });

  it("returns null when the key cannot be stored", async () => {
    const { admin } = createAdminDouble({
      "projects.select": { data: [{ id: "project-1" }] },
      "api_keys.insert": { error: { message: "insert failed" } },
    });

    await expect(issueBasecodeApiKey(admin, USER)).resolves.toBeNull();
  });

  it("survives a thrown query without taking sign-in down with it", async () => {
    const exploding = {
      from: () => {
        throw new Error("connection lost");
      },
    } as never;

    await expect(issueBasecodeApiKey(exploding, USER)).resolves.toBeNull();
  });
});
