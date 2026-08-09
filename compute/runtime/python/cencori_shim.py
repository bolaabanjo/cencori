"""
Cencori Python shim — wraps a user's Python agent with the Runtime Contract v2.

Baked into the Python base image (compute/runtime/python). The generic-python
adapter points the machine at this via START_COMMAND. It imports the agent named
by AGENT_ENTRYPOINT ("module:attr") and serves it.

Contract surface (parity with the Node shim):
  GET  /_health              liveness + entry
  GET  /_manifest            capabilities
  POST /invoke               sync sugar — runs to completion, returns {output}
  POST /runs                 start an async run → {id, status}
  GET  /runs/{id}            run state
  GET  /runs/{id}/events     SSE event stream (?after=<seq> to resume)
  POST /runs/{id}/cancel     request cancellation (task.cancel)
  POST /runs/{id}/resume     resume a suspended run with {resume|input}

Events are normalized across frameworks so the platform renders one timeline:
  run.started · message · run.suspended · run.output · run.failed · run.completed

Runs live in-memory (one agent per machine); reconnecting clients replay from
the ?after cursor. A durable run store lands with the platform.
"""
import os
import sys
import json
import time
import asyncio
import importlib
import uuid

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse
import uvicorn

app = FastAPI()
_ENTRY = None
FRAMEWORK = os.environ.get("FRAMEWORK", "")
TERMINAL = {"completed", "failed", "canceled"}
_RUNS: dict = {}


def _load():
    spec = os.environ.get("AGENT_ENTRYPOINT")
    if not spec:
        raise RuntimeError("AGENT_ENTRYPOINT is not set (module:attr)")
    module_name, _, attr = spec.partition(":")
    sys.path.insert(0, os.getcwd())
    module = importlib.import_module(module_name)
    return getattr(module, attr) if attr else module


def _entry():
    global _ENTRY
    if _ENTRY is None:
        _ENTRY = _load()
    return _ENTRY


def _safe(obj):
    """Coerce a framework object into something JSON-serializable."""
    try:
        json.dumps(obj)
        return obj
    except (TypeError, ValueError):
        return str(obj)


def _interrupt(chunk):
    """LangGraph interrupts surface as a `__interrupt__` key on a streamed chunk."""
    if isinstance(chunk, dict) and "__interrupt__" in chunk:
        return chunk["__interrupt__"]
    return None


async def _call(entry, payload):
    # LangChain/LangGraph Runnables expose .invoke; plain functions are callable.
    if hasattr(entry, "invoke"):
        result = entry.invoke(payload)
    elif callable(entry):
        result = entry(payload)
    else:
        raise TypeError("AGENT_ENTRYPOINT is not callable and has no .invoke()")
    if asyncio.iscoroutine(result):
        result = await result
    return result


async def _stream_agent(entry, payload):
    """Yield normalized events. Frameworks without async streaming run to completion."""
    # OpenAI Agents SDK (Python) — streamed run yields SDK events; final_output at end.
    if FRAMEWORK == "openai-agents":
        try:
            from agents import Runner  # openai-agents package
        except Exception:
            Runner = None
        if Runner is not None:
            result = Runner.run_streamed(entry, payload)
            async for ev in result.stream_events():
                yield {"type": "message", "data": _safe(ev)}
            yield {"type": "run.output", "output": _safe(getattr(result, "final_output", None))}
            return

    # LangGraph / LangChain — native async streaming.
    if hasattr(entry, "astream"):
        last = None
        async for chunk in entry.astream(payload):
            sus = _interrupt(chunk)
            if sus is not None:
                yield {"type": "run.suspended", "reason": "interrupt", "data": _safe(sus)}
                return
            last = chunk
            yield {"type": "message", "data": _safe(chunk)}
        yield {"type": "run.output", "output": _safe(last)}
        return

    # No async streaming — run to completion, emit a single output.
    yield {"type": "run.output", "output": _safe(await _call(entry, payload))}


async def _resume_agent(entry, payload):
    """Resume a suspended run. LangGraph resumes via Command(resume=...)."""
    resume_val = payload.get("resume", payload.get("input", payload)) if isinstance(payload, dict) else payload
    try:
        from langgraph.types import Command
        command = Command(resume=resume_val)
    except Exception:
        command = {"resume": resume_val}
    if hasattr(entry, "astream"):
        last = None
        async for chunk in entry.astream(command):
            sus = _interrupt(chunk)
            if sus is not None:
                yield {"type": "run.suspended", "reason": "interrupt", "data": _safe(sus)}
                return
            last = chunk
            yield {"type": "message", "data": _safe(chunk)}
        yield {"type": "run.output", "output": _safe(last)}
        return
    raise RuntimeError(f'resume is not supported for framework "{FRAMEWORK or "generic"}"')


# ── In-memory run store + SSE fan-out ──────────────────────────────────────

def _create_run(payload):
    run = {
        "id": str(uuid.uuid4()),
        "status": "running",  # running | suspended | completed | failed | canceled
        "input": payload,
        "output": None,
        "error": None,
        "suspend": None,
        "events": [],
        "seq": 0,
        "subscribers": set(),  # set[asyncio.Queue]
        "cancel": asyncio.Event(),
        "task": None,
        "created_at": _now(),
    }
    _RUNS[run["id"]] = run
    return run


def _now():
    return int(time.time() * 1000)


def _emit(run, event):
    run["seq"] += 1
    rec = {"seq": run["seq"], "ts": _now(), **event}
    run["events"].append(rec)
    for q in list(run["subscribers"]):
        q.put_nowait(rec)
    return rec


def _finish(run, status, **patch):
    if run["status"] in TERMINAL:
        return  # already settled — don't double-emit
    run["status"] = status
    run.update(patch)
    tail = {"error": patch["error"]} if patch.get("error") else {}
    _emit(run, {"type": "run.completed", "status": status, **tail})
    for q in list(run["subscribers"]):
        q.put_nowait(None)  # sentinel → close the SSE stream
    run["subscribers"].clear()


async def _drive(run, agen):
    _emit(run, {"type": "run.started", "runId": run["id"]})
    try:
        async for ev in agen:
            if run["cancel"].is_set():
                _finish(run, "canceled")
                return
            t = ev.get("type")
            if t == "run.suspended":
                run["suspend"] = {"reason": ev["reason"], "data": ev["data"]}
                _emit(run, ev)
                run["status"] = "suspended"  # not terminal — resumable
                return
            if t == "run.output":
                run["output"] = ev["output"]
                _emit(run, ev)
                _finish(run, "completed", output=ev["output"])
                return
            _emit(run, ev)
        # Iterator ended. Don't overwrite a run cancel/suspend already settled.
        if run["cancel"].is_set():
            _finish(run, "canceled")
        elif run["status"] == "running":
            _finish(run, "completed", output=run.get("output"))
    except asyncio.CancelledError:
        _finish(run, "canceled")
        raise
    except Exception as exc:  # noqa: BLE001 — surface any framework error
        err = {"code": "run_failed", "message": str(exc)}
        run["error"] = err
        _emit(run, {"type": "run.failed", "error": err})
        _finish(run, "failed", error=err)


def _run_view(run):
    return {
        "id": run["id"],
        "status": run["status"],
        "output": run["output"],
        "error": run["error"],
        "suspend": run["suspend"],
        "seq": run["seq"],
    }


def _sse(rec):
    return f'id: {rec["seq"]}\nevent: {rec["type"]}\ndata: {json.dumps(rec)}\n\n'


# ── HTTP ───────────────────────────────────────────────────────────────────

@app.get("/_health")
async def health():
    return {"ok": True, "entry": os.environ.get("AGENT_ENTRYPOINT")}


@app.get("/_manifest")
async def manifest():
    return {"contract": "v2", "shim": "generic-python", "framework": FRAMEWORK or "generic", "streaming": True, "runs": True}


@app.post("/invoke")
async def invoke(req: Request):
    body = await req.json()
    try:
        output = await _call(_entry(), body.get("input"))
    except Exception as exc:  # noqa: BLE001
        return JSONResponse({"error": {"code": "invoke_failed", "message": str(exc)}}, status_code=500)
    return {"output": _safe(output)}


@app.post("/runs")
async def start_run(req: Request):
    body = await req.json()
    run = _create_run(body.get("input"))
    run["task"] = asyncio.create_task(_drive(run, _stream_agent(_entry(), body.get("input"))))
    return JSONResponse(_run_view(run), status_code=202)


@app.get("/runs/{run_id}")
async def get_run(run_id: str):
    run = _RUNS.get(run_id)
    if not run:
        return JSONResponse({"error": {"code": "run_not_found", "message": run_id}}, status_code=404)
    return _run_view(run)


@app.get("/runs/{run_id}/events")
async def run_events(run_id: str, after: int = 0):
    run = _RUNS.get(run_id)
    if not run:
        return JSONResponse({"error": {"code": "run_not_found", "message": run_id}}, status_code=404)

    async def gen():
        # Subscribe first, then replay — so events between replay and subscribe
        # aren't lost. De-dupe live records already covered by the replay.
        q: asyncio.Queue = asyncio.Queue()
        run["subscribers"].add(q)
        replayed = after
        try:
            for ev in list(run["events"]):
                if ev["seq"] > after:
                    replayed = max(replayed, ev["seq"])
                    yield _sse(ev)
            if run["status"] in TERMINAL:
                return
            while True:
                rec = await q.get()
                if rec is None:
                    break
                if rec["seq"] > replayed:
                    yield _sse(rec)
        finally:
            run["subscribers"].discard(q)

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )


@app.post("/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    run = _RUNS.get(run_id)
    if not run:
        return JSONResponse({"error": {"code": "run_not_found", "message": run_id}}, status_code=404)
    if run["status"] in ("running", "suspended"):
        run["cancel"].set()
        if run["task"] and not run["task"].done():
            run["task"].cancel()
        _finish(run, "canceled")
    return _run_view(run)


@app.post("/runs/{run_id}/resume")
async def resume_run(run_id: str, req: Request):
    run = _RUNS.get(run_id)
    if not run:
        return JSONResponse({"error": {"code": "run_not_found", "message": run_id}}, status_code=404)
    if run["status"] != "suspended":
        return JSONResponse({"error": {"code": "not_suspended", "message": f'run is {run["status"]}'}}, status_code=409)
    body = await req.json()
    run["status"] = "running"
    run["suspend"] = None
    run["cancel"] = asyncio.Event()
    run["task"] = asyncio.create_task(_drive(run, _resume_agent(_entry(), body)))
    return JSONResponse(_run_view(run), status_code=202)


if __name__ == "__main__":
    try:
        _ENTRY = _load()
        print(f"[cencori-shim] loaded {os.environ.get('AGENT_ENTRYPOINT')} (contract v2, framework={FRAMEWORK or 'generic'})", file=sys.stderr)
    except Exception as exc:  # noqa: BLE001 — defer failure to first call
        print(f"[cencori-shim] could not import AGENT_ENTRYPOINT yet: {exc}", file=sys.stderr)
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))
