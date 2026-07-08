# Cencori

**The unified infrastructure layer for AI applications.**

One SDK. Every AI primitive. Always secure. Always logged.

```bash
npm install cencori
```

## Quick Start

```typescript
import { Cencori } from 'cencori';

const cencori = new Cencori({ 
  apiKey: process.env.CENCORI_API_KEY 
});

// AI Gateway - Chat with any model
const response = await cencori.ai.chat({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello!' }]
});

console.log(response.content);
```

## Products

| Product | Status | Description |
|---------|--------|-------------|
| **AI Gateway** | ✅ Available | Multi-provider routing, security, observability |
| **Billing** | ✅ Available | End-user usage monetization and Stripe integration |
| **Integration** | ✅ Available | SDKs, Vercel AI, TanStack |

## AI Gateway

### Chat Completions

```typescript
const response = await cencori.ai.chat({
  model: 'gpt-4o', // or 'claude-3-opus', 'gemini-1.5-pro', etc.
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: 'What is the capital of France?' }
  ],
  temperature: 0.7,
  maxTokens: 1000
});

console.log(response.content);
console.log(response.usage); // { promptTokens, completionTokens, totalTokens }
```

### Multimodal (Image Input)

```typescript
const response = await cencori.ai.chat({
  model: 'gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'What is in this image?' },
      { type: 'image_url', image_url: { url: 'https://example.com/image.jpg' } }
    ]
  }]
});
```

### Tool Usage (Function Calling)

```typescript
const response = await cencori.ai.chat({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'What is the weather in Tokyo?' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get the current weather for a location',
      parameters: {
        type: 'object',
        properties: { location: { type: 'string' } },
        required: ['location']
      }
    }
  }]
});

if (response.toolCalls) {
  console.log(response.toolCalls); // [{ function: { name: 'get_weather', arguments: '{"location":"Tokyo"}' } }]
}
```

### Structured Output (Object Generation)

```typescript
interface UserProfile {
  name: string;
  age: number;
  interests: string[];
}

const response = await cencori.ai.generateObject<UserProfile>({
  model: 'gpt-4o',
  prompt: 'Generate a fictional user profile',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      age: { type: 'number' },
      interests: { type: 'array', items: { type: 'string' } }
    },
    required: ['name', 'age', 'interests']
  }
});

console.log(response.object); // { name: 'Alice', age: 28, interests: ['hiking'] }
```

### Embeddings

```typescript
const response = await cencori.ai.embeddings({
  model: 'text-embedding-3-small',
  input: 'Hello world'
});

console.log(response.embeddings[0]); // [0.1, 0.2, ...]
```

### Vision (Image Understanding)

Analyze, describe, OCR, and classify images. Routes across OpenAI, Anthropic, and Google vision-capable models.

```typescript
// General analysis with a custom prompt
const result = await cencori.vision.analyze({
  image: { url: 'https://example.com/photo.jpg' },
  prompt: 'What breed of dog is this?'
});

// OCR from a local file
import fs from 'node:fs';
const buf = fs.readFileSync('receipt.png');
const { text } = await cencori.vision.ocr({
  image: { base64: buf.toString('base64'), mimeType: 'image/png' }
});

// Structured classification
const { classification } = await cencori.vision.classify({
  image: { url: 'https://example.com/product.jpg' }
});
// classification: { primary_category, tags, objects, safe_for_work, ... }
```

Drop-in React uploader for your own product (`cencori/react`):

```tsx
import { VisionUploader } from 'cencori/react';

<VisionUploader
  endpoint="https://cencori.com/api/ai/vision"
  apiKey={process.env.NEXT_PUBLIC_CENCORI_KEY}
  task="describe"
  onResult={(r) => console.log(r)}
/>
```

Full API in [docs](https://cencori.com/docs/ai/endpoints/vision).

### Documents (PDF & Image Extraction)

Extract text from PDFs and images, summarize documents, and answer questions about them. Text-based PDFs use native parsing — no LLM tokens, free.

```typescript
// Extract text — native PDF parsing, free
const { text, method } = await cencori.documents.extract({
  document: { url: 'https://example.com/contract.pdf' },
});
console.log(method); // 'pdf_text' means free

// Summarize
const { summary } = await cencori.documents.summarize({
  document: { url: 'https://example.com/report.pdf' },
});

// Q&A — strict "Not found" if the answer isn't in the doc
const { answer } = await cencori.documents.query({
  document: { url: 'https://example.com/contract.pdf' },
  question: 'What is the termination clause?',
});
```

Full API in [docs](https://cencori.com/docs/ai/endpoints/documents). See the [Contract Analyzer tutorial](https://cencori.com/docs/guides/build-a-contract-analyzer) for an end-to-end example.

### Image Generation

Generate images from text prompts using multiple providers:

```typescript
const response = await cencori.ai.generateImage({
  prompt: 'A futuristic city at sunset with flying cars',
  model: 'gpt-image-1.5',  // Best text rendering, top ELO rating
  size: '1024x1024',
  quality: 'hd'
});

console.log(response.images[0].url); // https://...
```

**Supported Models:**
| Provider | Models | Description |
|----------|--------|-------------|
| **OpenAI** | `gpt-image-1.5`, `gpt-image-1`, `dall-e-3`, `dall-e-2` | Text rendering, creative |
| **Google** | `gemini-3-pro-image`, `imagen-3` | High photorealism |

## Framework Integrations

### Vercel AI SDK

```typescript
import { cencori } from 'cencori/vercel';
import { streamText } from 'ai';

const result = await streamText({
  model: cencori('gpt-4o'),
  messages: [{ role: 'user', content: 'Hello!' }]
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

### With React/Next.js

```typescript
import { cencori } from 'cencori/vercel';
import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, input, handleInputChange, handleSubmit } = useChat({
    api: '/api/chat'
  });
  
  return (
    <div>
      {messages.map(m => <div key={m.id}>{m.content}</div>)}
      <form onSubmit={handleSubmit}>
        <input value={input} onChange={handleInputChange} />
      </form>
    </div>
  );
}
```
## Why Cencori?

- **🛡️ Security Built-in**: PII detection, content filtering, jailbreak protection
- **📊 Observability**: Every request logged, every token tracked
- **💰 Cost Control**: Budget alerts, spend caps, per-request costing
- **🔄 Multi-Provider**: Switch between OpenAI, Anthropic, Google, etc.
- **⚡ One SDK**: AI model routing, security shield, and billing - unified

## Links

- [Documentation](https://cencori.com/docs)
- [Dashboard](https://cencori.com/dashboard)
- [GitHub](https://github.com/cencori/cencori)

## License

MIT
