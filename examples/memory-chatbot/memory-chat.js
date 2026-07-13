/**
 * Cencori Memory — cross-session chatbot demo
 *
 * Proves the wedge: a chat app that remembers a user across *separate*
 * conversations. Session 1 has no shared history with Session 2 — the only
 * thing carried between them is what the gateway chose to remember.
 *
 * Run it twice with the same CENCORI_USER_ID and watch the second session
 * already know who you are.
 */

import { Cencori } from 'cencori';
import 'dotenv/config';

const cencori = new Cencori({ apiKey: process.env.CENCORI_API_KEY });

// The one line that makes chat stateful. Everything hangs off this id.
const userId = process.env.CENCORI_USER_ID || 'demo-user-1';
const model = process.env.CENCORI_MODEL || 'gpt-4o';

/** One turn. `messages` is only THIS session's history — memory does the rest. */
async function ask(messages) {
  const res = await cencori.chat.completions.create({
    model,
    messages,
    memory: { userId }, // retrieve + write both default on
  });
  const reply = res.choices[0].message.content;
  const recalled = res.memory?.retrieved ?? [];
  return { reply, recalled };
}

async function session(label, turns) {
  console.log(`\n=== ${label} ===`);
  const messages = [];
  for (const content of turns) {
    console.log(`\n🧑 ${content}`);
    messages.push({ role: 'user', content });
    const { reply, recalled } = await ask(messages);
    if (recalled.length) {
      console.log(`   🧠 recalled ${recalled.length}: ${recalled.map((m) => m.content).join(' | ')}`);
    }
    console.log(`🤖 ${reply}`);
    messages.push({ role: 'assistant', content: reply });
  }
}

async function main() {
  // Session 1 — teach the model something. Writeback is async; give it a beat.
  await session('Session 1 (teaching)', [
    "Hi! I'm building a bookkeeping app called Ledgerkit. I prefer TypeScript and always use dark mode.",
  ]);

  console.log('\n…waiting for async writeback before the next session…');
  await new Promise((r) => setTimeout(r, 3000));

  // Session 2 — a brand new conversation. No shared message history.
  await session('Session 2 (a new chat — should already know you)', [
    'What language should I use for Ledgerkit, and what theme do I like?',
  ]);
}

main().catch((err) => {
  console.error('\n❌', err.message);
  process.exit(1);
});
