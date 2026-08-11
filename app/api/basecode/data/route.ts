import { NextRequest, NextResponse } from "next/server";
import {
  authenticateBasecodeDataRequest,
  cleanText,
  isUuid,
} from "@/lib/basecode-data";
import { noStoreHeaders } from "@/lib/basecode-auth";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { headers: noStoreHeaders(), status });
}

function workspaceJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    clientKey: row.client_key,
    name: row.name,
    pinned: row.pinned,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function threadJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    deviceId: row.device_id,
    sidecarThreadId: row.sidecar_thread_id,
    title: row.title,
    model: row.model,
    status: row.status,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function turnJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    threadId: row.thread_id,
    sidecarTurnId: row.sidecar_turn_id,
    sequence: row.sequence,
    userMessage: row.user_message,
    assistantMessage: row.assistant_message,
    model: row.model,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

export async function GET(request: NextRequest) {
  const session = await authenticateBasecodeDataRequest(request.headers.get("authorization"));
  if (!session) return json({ error: "Your Cencori session is invalid." }, 401);

  const threadId = request.nextUrl.searchParams.get("thread_id");
  if (threadId) {
    if (!isUuid(threadId)) return json({ error: "The thread id is invalid." }, 400);
    const { data: thread, error: threadError } = await session.admin
      .from("basecode_threads")
      .select("*")
      .eq("id", threadId)
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (threadError) return json({ error: "The thread could not be loaded." }, 500);
    if (!thread) return json({ error: "Thread not found." }, 404);

    const { data: turns, error: turnsError } = await session.admin
      .from("basecode_turns")
      .select("*")
      .eq("thread_id", threadId)
      .eq("user_id", session.user.id)
      .order("sequence", { ascending: true });
    if (turnsError) return json({ error: "The thread history could not be loaded." }, 500);
    return json({ thread: threadJson(thread), turns: (turns ?? []).map(turnJson) });
  }

  const [{ data: workspaces, error: workspaceError }, { data: threads, error: threadError }] =
    await Promise.all([
      session.admin
        .from("basecode_workspaces")
        .select("*")
        .eq("user_id", session.user.id)
        .is("archived_at", null)
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false }),
      session.admin
        .from("basecode_threads")
        .select("*")
        .eq("user_id", session.user.id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);
  if (workspaceError || threadError) {
    return json({ error: "Basecode history could not be loaded." }, 500);
  }
  return json({
    workspaces: (workspaces ?? []).map(workspaceJson),
    threads: (threads ?? []).map(threadJson),
  });
}

export async function POST(request: NextRequest) {
  const session = await authenticateBasecodeDataRequest(request.headers.get("authorization"));
  if (!session) return json({ error: "Your Cencori session is invalid." }, 401);

  let body: Record<string, unknown>;
  try {
    const value: unknown = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    body = value as Record<string, unknown>;
  } catch {
    return json({ error: "The Basecode request is invalid." }, 400);
  }

  if (body.action === "register_device") {
    const installationId = body.installationId;
    const name = cleanText(body.name, 120);
    const platform = cleanText(body.platform, 40);
    if (!isUuid(installationId) || !name || !platform) return json({ error: "Invalid device." }, 400);
    const { data, error } = await session.admin
      .from("basecode_devices")
      .upsert(
        {
          user_id: session.user.id,
          installation_id: installationId,
          name,
          platform,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "user_id,installation_id" },
      )
      .select("id, installation_id, name, platform, last_seen_at")
      .single();
    return error ? json({ error: "The device could not be registered." }, 500) : json({ device: data });
  }

  if (body.action === "upsert_workspace") {
    const clientKey = body.clientKey;
    const name = cleanText(body.name, 160);
    if (!isUuid(clientKey) || !name) return json({ error: "Invalid workspace." }, 400);
    const { data, error } = await session.admin
      .from("basecode_workspaces")
      .upsert(
        {
          user_id: session.user.id,
          client_key: clientKey,
          name,
          pinned: body.pinned === true,
          archived_at: null,
        },
        { onConflict: "user_id,client_key" },
      )
      .select("*")
      .single();
    return error || !data
      ? json({ error: "The workspace could not be saved." }, 500)
      : json({ workspace: workspaceJson(data) });
  }

  if (body.action === "update_workspace") {
    if (!isUuid(body.workspaceId)) return json({ error: "Invalid workspace." }, 400);
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = cleanText(body.name, 160);
      if (!name) return json({ error: "Invalid workspace name." }, 400);
      update.name = name;
    }
    if (body.pinned !== undefined) update.pinned = body.pinned === true;
    if (body.archived !== undefined) update.archived_at = body.archived === true ? new Date().toISOString() : null;
    if (Object.keys(update).length === 0) {
      return json({ error: "No workspace changes were provided." }, 400);
    }
    const { data, error } = await session.admin
      .from("basecode_workspaces")
      .update(update)
      .eq("id", body.workspaceId)
      .eq("user_id", session.user.id)
      .select("*")
      .maybeSingle();
    return error || !data
      ? json({ error: "The workspace could not be updated." }, error ? 500 : 404)
      : json({ workspace: workspaceJson(data) });
  }

  if (body.action === "upsert_thread") {
    const workspaceId = body.workspaceId;
    const deviceId = body.deviceId;
    const sidecarThreadId = cleanText(body.sidecarThreadId, 160);
    const title = cleanText(body.title, 240);
    if (!isUuid(workspaceId) || !isUuid(deviceId) || !sidecarThreadId || !title) {
      return json({ error: "Invalid thread." }, 400);
    }
    const model = body.model === null ? null : cleanText(body.model, 120);
    const status = ["idle", "running", "completed", "interrupted", "failed"].includes(String(body.status))
      ? body.status
      : "idle";
    const { data, error } = await session.admin
      .from("basecode_threads")
      .upsert(
        {
          user_id: session.user.id,
          workspace_id: workspaceId,
          device_id: deviceId,
          sidecar_thread_id: sidecarThreadId,
          title,
          model,
          status,
          archived_at: null,
        },
        { onConflict: "user_id,device_id,sidecar_thread_id" },
      )
      .select("*")
      .single();
    return error || !data
      ? json({ error: "The thread could not be saved." }, 500)
      : json({ thread: threadJson(data) });
  }

  if (body.action === "upsert_turn") {
    const threadId = body.threadId;
    const sidecarTurnId = cleanText(body.sidecarTurnId, 160);
    const userMessage =
      typeof body.userMessage === "string" && body.userMessage.length <= 1_000_000
        ? body.userMessage
        : null;
    const assistantMessage =
      typeof body.assistantMessage === "string" && body.assistantMessage.length <= 1_000_000
        ? body.assistantMessage
        : null;
    if (!isUuid(threadId) || !sidecarTurnId || userMessage === null) {
      return json({ error: "Invalid turn." }, 400);
    }
    const sequence = Number.isInteger(body.sequence) && Number(body.sequence) >= 0 ? body.sequence : 0;
    const status = ["running", "completed", "interrupted", "failed"].includes(String(body.status))
      ? body.status
      : "running";
    const { data, error } = await session.admin
      .from("basecode_turns")
      .upsert(
        {
          user_id: session.user.id,
          thread_id: threadId,
          sidecar_turn_id: sidecarTurnId,
          sequence,
          user_message: userMessage,
          assistant_message: assistantMessage,
          model: body.model === null ? null : cleanText(body.model, 120),
          status,
          completed_at: status === "running" ? null : new Date().toISOString(),
        },
        { onConflict: "thread_id,sidecar_turn_id" },
      )
      .select("*")
      .single();
    if (error || !data) return json({ error: "The turn could not be saved." }, 500);
    await session.admin
      .from("basecode_threads")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", threadId)
      .eq("user_id", session.user.id);
    return json({ turn: turnJson(data) });
  }

  if (body.action === "archive_workspace_threads") {
    if (!isUuid(body.workspaceId)) return json({ error: "Invalid workspace." }, 400);
    const { error } = await session.admin
      .from("basecode_threads")
      .update({ archived_at: new Date().toISOString() })
      .eq("workspace_id", body.workspaceId)
      .eq("user_id", session.user.id);
    return error ? json({ error: "Chats could not be archived." }, 500) : json({ ok: true });
  }

  return json({ error: "Unknown Basecode action." }, 400);
}
