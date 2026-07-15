# Cencori Memory — A Chatbot That Remembers

A chatbot that remembers a user across **separate** conversations, using Cencori gateway memory. No vector store to run, no retrieval to wire — memory is a field on the request.

## The whole idea

```js
await cencori.chat.completions.create({
  model: 'gpt-4o',
  messages,
  memory: { userId },   // ← retrieve what we know, persist what's new
});
```

## Run it

1. **Install:**
   ```bash
   npm install
   ```

2. **Set your key:** create a `.env`:
   ```
   CENCORI_API_KEY=your_api_key_here
   CENCORI_USER_ID=demo-user-1
   ```
   Get a key at https://cencori.com/dashboard.

3. **Run:**
   ```bash
   npm start
   ```

Session 1 tells the model you're building "Ledgerkit" in TypeScript with dark mode. Session 2 is a **fresh conversation with no shared history** — yet it still answers "TypeScript, dark mode" because the gateway remembered. That's the wedge: *a new chat is not a memory reset.*

## In React — two lines

The same thing in a UI, via `cencori/react`:

```tsx
import { Chat } from 'cencori/react';

<Chat
  model="gpt-4o"
  apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY!}
  memory={{ userId: session.user.id }}
/>
```

And a "what we remember about you" panel with right-to-be-forgotten:

```tsx
import { useMemory } from 'cencori/react';

const { memories, forget, exportAll } = useMemory({ userId });
```

See the [Memory docs](https://cencori.com/docs/ai/endpoints/memory) for the full surface.
