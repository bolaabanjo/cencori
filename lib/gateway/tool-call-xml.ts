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
 *
 * Three dialects, because models do not agree on one. The first is the parameter-tag form; the
 * other two put JSON inside the tags, which is what the Qwen family emits most often. A model that
 * has invented a fourth is left as text, and its markup is still withheld from the stream.
 */
const PARAMETER = /<parameter=([a-zA-Z0-9_.-]{1,64})>([\s\S]*?)<\/parameter>/g;

/** Every tag that opens a block in any dialect below. */
const OPENING_TAGS = ['<tool_call>', '<function_call>'] as const;

type Dialect = {
  extract: (match: RegExpExecArray) => RecoveredToolCall | null;
  pattern: RegExp;
};

const DIALECTS: Dialect[] = [
  {
    // <tool_call><function=read_file><parameter=path>a.ts</parameter></function></tool_call>
    pattern:
      /<tool_call>\s*<function=([a-zA-Z0-9_.-]{1,64})>([\s\S]*?)<\/function>\s*<\/tool_call>/g,
    extract: (match) => {
      const name = match[1] ?? '';
      const args: Record<string, unknown> = {};
      const body = match[2] ?? '';
      PARAMETER.lastIndex = 0;
      for (let param = PARAMETER.exec(body); param; param = PARAMETER.exec(body)) {
        args[param[1] ?? ''] = parameterValue(param[2] ?? '');
      }
      return { arguments: JSON.stringify(args), name };
    },
  },
  {
    // <tool_call>{"name":"read_file","arguments":{"path":"a.ts"}}</tool_call>, and the same body
    // under <function_call>. The matching closing tag delimits the body, rather than a brace: a
    // lazy brace match stops inside a nested object, and a greedy one swallows every block in the
    // message down to the last one. `jsonCall` rejects whatever is not an object, which is how the
    // parameter-tag form above falls through this pattern untouched.
    pattern: /<(tool_call|function_call)>([\s\S]*?)<\/\1>/g,
    extract: (match) => jsonCall(match[2] ?? ''),
  },
];

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
 * A call written as a JSON object. `arguments` is what most models emit and `parameters` what the
 * rest do; either may arrive as an object or as a string holding JSON, and both normalise to the
 * JSON string a structured call would have carried.
 */
function jsonCall(body: string): RecoveredToolCall | null {
  const text = body.trim();
  if (!text.startsWith('{')) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;

  const record = parsed as Record<string, unknown>;
  const name = record.name;
  if (typeof name !== 'string' || !name) return null;

  const args = record.arguments ?? record.parameters ?? {};
  if (typeof args === 'string') {
    // Already the shape a structured call carries. Kept if it parses; a string that does not is
    // not turned into a call, because guessing the arguments is how a recovery becomes a
    // fabrication.
    try {
      JSON.parse(args);
      return { arguments: args, name };
    } catch {
      return null;
    }
  }
  return { arguments: JSON.stringify(args), name };
}

type FoundBlock = { call: RecoveredToolCall; end: number; start: number };

/**
 * Every block any dialect recognises, with overlaps resolved.
 *
 * Two dialects can match the same span, since a parameter value holding a brace is also a JSON
 * body to the second pattern. Matches are collected, then taken earliest-first and longest-first,
 * and anything starting inside a block already taken is dropped — recovering one call twice would
 * run the tool twice.
 */
function findBlocks(text: string): FoundBlock[] {
  const found: FoundBlock[] = [];
  for (const dialect of DIALECTS) {
    dialect.pattern.lastIndex = 0;
    for (let match = dialect.pattern.exec(text); match; match = dialect.pattern.exec(text)) {
      const call = dialect.extract(match);
      if (!call) continue;
      found.push({ call, end: match.index + match[0].length, start: match.index });
    }
  }

  found.sort((left, right) => left.start - right.start || right.end - left.end);

  const kept: FoundBlock[] = [];
  let cursor = -1;
  for (const block of found) {
    if (block.start < cursor) continue;
    kept.push(block);
    cursor = block.end;
  }
  return kept;
}

/**
 * @param offered Tool names this request actually advertised. A block naming anything else is left
 *   alone: a model quoting the syntax, or explaining it, must not become an execution, and the
 *   runtime would reject an unknown name anyway.
 */
export function recoverXmlToolCalls(text: string, offered: readonly string[]): ToolCallRecovery {
  if (!OPENING_TAGS.some((tag) => text.includes(tag))) return { calls: [], text };

  const names = new Set(offered);
  const calls: RecoveredToolCall[] = [];
  let cleaned = '';
  let cursor = 0;

  for (const block of findBlocks(text)) {
    if (!names.has(block.call.name)) continue;
    calls.push(block.call);
    cleaned += text.slice(cursor, block.start);
    cursor = block.end;
  }

  if (calls.length === 0) return { calls: [], text };

  cleaned += text.slice(cursor);
  return { calls, text: cleaned.replace(/\n{3,}/g, '\n\n').trim() };
}

/**
 * How much of a partially received message is safe to show.
 *
 * Streaming releases text as it arrives, so by the time a block is complete the markup has already
 * reached the client and cannot be taken back. Nothing after an opening tag is released: either it
 * becomes a recovered call at the end of the message, or it stays text and is released then. A
 * message with no tool call in it is unaffected, which is nearly all of them.
 *
 * The tail is checked for a partial opening tag as well, because `<tool_` and `call>` can arrive in
 * different chunks and half a tag on screen is no better than a whole one.
 */
export function releasableLength(text: string): number {
  let safe = text.length;

  for (const tag of OPENING_TAGS) {
    const opened = text.indexOf(tag);
    if (opened >= 0) {
      safe = Math.min(safe, opened);
      continue;
    }
    for (let length = tag.length - 1; length > 0; length -= 1) {
      if (text.endsWith(tag.slice(0, length))) {
        safe = Math.min(safe, text.length - length);
        break;
      }
    }
  }

  return safe;
}
