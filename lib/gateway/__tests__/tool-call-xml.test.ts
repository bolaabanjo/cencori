import { describe, expect, it } from "vitest";
import { recoverXmlToolCalls } from "@/lib/gateway/tool-call-xml";

const OFFERED = ["read_file", "exec_command", "update_plan"];

describe("recovering tool calls written as text", () => {
  it("recovers the call and takes the markup out of the message", () => {
    // Exactly as it arrived in the rollout that started this.
    const text =
      "<tool_call> <function=read_file> <parameter=path>/Users/apple/arcie-test/agent/instructions.md</parameter> </function> </tool_call>";

    const { calls, text: cleaned } = recoverXmlToolCalls(text, OFFERED);

    expect(calls).toEqual([
      {
        arguments: JSON.stringify({ path: "/Users/apple/arcie-test/agent/instructions.md" }),
        name: "read_file",
      },
    ]);
    expect(cleaned).toBe("");
  });

  it("keeps the prose a call was buried in", () => {
    const text =
      "Now I'm going into the app directory.<tool_call> <function=exec_command> " +
      "<parameter=workdir>/Users/apple/hack</parameter> <parameter=cmd>ls</parameter> " +
      "</function> </tool_call>";

    const { calls, text: cleaned } = recoverXmlToolCalls(text, OFFERED);

    expect(calls[0]?.name).toBe("exec_command");
    expect(JSON.parse(calls[0]?.arguments ?? "{}")).toEqual({ cmd: "ls", workdir: "/Users/apple/hack" });
    expect(cleaned).toBe("Now I'm going into the app directory.");
  });

  it("keeps a JSON argument as JSON rather than as the string it was written as", () => {
    const plan = '[{"step": "Read project structure", "status": "completed"}]';
    const text = `<tool_call> <function=update_plan> <parameter=plan>${plan}</parameter> </function> </tool_call>`;

    const { calls } = recoverXmlToolCalls(text, OFFERED);

    expect(JSON.parse(calls[0]?.arguments ?? "{}")).toEqual({
      plan: [{ status: "completed", step: "Read project structure" }],
    });
  });

  it("recovers several calls from one message", () => {
    const text =
      "<tool_call> <function=read_file> <parameter=path>a</parameter> </function> </tool_call>" +
      "<tool_call> <function=read_file> <parameter=path>b</parameter> </function> </tool_call>";

    expect(recoverXmlToolCalls(text, OFFERED).calls).toHaveLength(2);
  });

  it("leaves a tool this request never offered as text", () => {
    // A model quoting the syntax, or explaining it, must not become an execution.
    const text = "<tool_call> <function=rm_rf> <parameter=path>/</parameter> </function> </tool_call>";

    expect(recoverXmlToolCalls(text, OFFERED)).toEqual({ calls: [], text });
  });

  it("leaves a half-written block alone rather than guessing the rest", () => {
    const text = "<tool_call> <function=read_file> <parameter=path>/etc/hosts</parameter>";

    expect(recoverXmlToolCalls(text, OFFERED)).toEqual({ calls: [], text });
  });

  it("does nothing to a message that never mentions a tool call", () => {
    const text = "Here is what I found in the repository.";

    expect(recoverXmlToolCalls(text, OFFERED)).toEqual({ calls: [], text });
  });

  it("recovers a call with no parameters", () => {
    const text = "<tool_call> <function=update_plan> </function> </tool_call>";

    expect(recoverXmlToolCalls(text, OFFERED).calls).toEqual([
      { arguments: "{}", name: "update_plan" },
    ]);
  });

  it("is not confused by a second call after the first", () => {
    const text = "one<tool_call> <function=read_file> <parameter=path>a</parameter> </function> </tool_call>two";

    expect(recoverXmlToolCalls(text, OFFERED).text).toBe("onetwo");
  });
});
