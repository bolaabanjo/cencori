# Getting Started

## Install

```bash
npx eline@latest init my-agent
cd my-agent
npm install
```

## Run

```bash
npm run dev
```

This starts a local dev server. Send requests:

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}'
```

## Add a Tool

Create `agent/tools/get_weather.ts`:

```ts
import { defineTool } from "eline/tools";
import { z } from "zod";

export default defineTool({
  description: "Get the current weather for a city.",
  inputSchema: z.object({ city: z.string() }),
  async execute({ city }) {
    return { city, condition: "Sunny", temperatureF: 72 };
  },
});
```

## Deploy

Set your Cencori API key and deploy to your infrastructure:

```bash
export CENCORI_API_KEY=sk_...
export CENCORI_PROJECT_ID=proj_...

npm run build
```
