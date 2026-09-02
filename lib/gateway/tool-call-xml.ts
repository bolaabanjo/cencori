/**
 * Recovering tool calls a model wrote as text instead of emitting structurally.
 *
 * Some models behind the gateway occasionally answer with the tool-call syntax spelled out in the
 * message body rather than as a structured call:
 *
 *   <tool_call> <function=read_file> <parameter=path>/etc/hosts</parameter> </function> </tool_call>
 *
 * Nothing downstream is looking for that. The runtime records it as ordinary assistant text, the
 * tool never runs, and the user is shown the markup — which is what made an audit stop halfway
 * through and print its plan as prose.
 *
 * Recovered calls are returned as ordinary function calls and take the ordinary path: the runtime
 * puts them through the same registry, approval and sandbox checks as a structurally emitted call.
 * This recovers a call the model meant to make; it does not create one it did not, and it grants
 * nothing a structured call would not have been granted.
 */

export type RecoveredToolCall = {
  arguments: string;
  name: string;
};

export type ToolCallRecovery = {
  calls: RecoveredToolCall[];
  /** The message with the recovered markup removed, so nobody is shown the syntax. */
  text: string;
};

/**
 * Deliberately strict. A partial or malformed block is left as text rather than guessed at: half a
 * tool call is not a tool call, and inventing the missing half is how a recovery becomes a
 * fabrication.
 */
const TOOL_CALL_BLOCK = /<tool_call>\s*<function=([a-zA-Z0-9_.-]{1,64})>([\s\S]*?)<\/function>\s*<\/tool_call>/g;
const PARAMETER = /<parameter=([a-zA-Z0-9_.-]{1,64})>([\s\S]*?)<\/parameter>/g;

/** A JSON argument survives as JSON; anything else stays the string it was written as. */
function parameterValue(raw: string): unknown {
  const value = raw.trim();
  if (!/^[[{]/.test(value)) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * @param offered Tool names this request actually advertised. A block naming anything else is left
 *   alone: a model quoting the syntax, or explaining it, must not become an execution, and the
 *   runtime would reject an unknown name anyway.
 */
export function recoverXmlToolCalls(text: string, offered: readonly string[]): ToolCallRecovery {
  if (!text.includes('<tool_call>')) return { calls: [], text };

  const names = new Set(offered);
  const calls: RecoveredToolCall[] = [];
  let cleaned = '';
  let cursor = 0;

  TOOL_CALL_BLOCK.lastIndex = 0;
  for (let block = TOOL_CALL_BLOCK.exec(text); block; block = TOOL_CALL_BLOCK.exec(text)) {
    const [matched, name = '', body = ''] = block;
    if (!names.has(name)) continue;

    const args: Record<string, unknown> = {};
    PARAMETER.lastIndex = 0;
    for (let param = PARAMETER.exec(body); param; param = PARAMETER.exec(body)) {
      const [, key = '', raw = ''] = param;
      args[key] = parameterValue(raw);
    }

    calls.push({ arguments: JSON.stringify(args), name });
    cleaned += text.slice(cursor, block.index);
    cursor = block.index + matched.length;
  }

  if (calls.length === 0) return { calls: [], text };

  cleaned += text.slice(cursor);
  return { calls, text: cleaned.replace(/\n{3,}/g, '\n\n').trim() };
}
