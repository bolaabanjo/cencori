# Cencori Python SDK

Official Python SDK for Cencori - AI Infrastructure for Production.

## Installation

```bash
pip install cencori
```

## Quick Start

```python
from cencori import Cencori

cencori = Cencori(api_key="your-api-key")

# Chat
response = cencori.ai.chat(
    messages=[{"role": "user", "content": "Hello!"}]
)
print(response.content)

# Embeddings
embedding = cencori.ai.embeddings(
    input="Hello world",
    model="text-embedding-3-small"
)
print(len(embedding.embeddings[0]))

# Vision — analyze, describe, OCR, classify
result = cencori.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="What breed of dog is this?",
)
print(result["analysis"])
```

## Vision

Analyze, describe, OCR, and classify images. Routes across OpenAI, Anthropic, and Google vision-capable models.

```python
# From a URL
result = cencori.vision.analyze(
    image_url="https://example.com/photo.jpg",
    prompt="Describe the mood of this photo",
)

# OCR from a local file
import base64
with open("receipt.png", "rb") as f:
    b64 = base64.b64encode(f.read()).decode()

ocr = cencori.vision.ocr(image_base64=b64, mime_type="image/png")
print(ocr["text"])

# Structured classification
classification = cencori.vision.classify(image_url="https://example.com/product.jpg")
# classification["classification"] is a dict when the model returns valid JSON
```

Async variants: `cencori.vision.a_analyze()`, `a_describe()`, `a_ocr()`, `a_classify()`.

Full API in [docs](https://cencori.com/docs/ai/endpoints/vision).

## Documents

Extract text from PDFs and images, summarize, and answer questions. Text-based PDFs use native parsing — no LLM tokens.

```python
# Extract text (native PDF parse — free)
result = cencori.documents.extract(
    document_url="https://example.com/contract.pdf",
)
print(result["method"])  # 'pdf_text' — no LLM cost

# Summarize
summary = cencori.documents.summarize(document_url="https://example.com/report.pdf")
print(summary["summary"])

# Q&A — strict "Not found" if answer isn't present
answer = cencori.documents.query(
    document_url="https://example.com/contract.pdf",
    question="What is the termination clause?",
)
print(answer["answer"])
```

Async variants: `a_extract()`, `a_summarize()`, `a_query()`.

Full API in [docs](https://cencori.com/docs/ai/endpoints/documents).

## Async Support

All methods have async counterparts:

```python
import asyncio
from cencori import Cencori

async def main():
    cencori = Cencori()
    
    # Async chat
    response = await cencori.ai.async_chat(
        messages=[{"role": "user", "content": "Hello!"}]
    )
    print(response.content)

asyncio.run(main())
```

## Streaming

```python
for chunk in cencori.ai.chat_stream(
    messages=[{"role": "user", "content": "Tell me a story"}],
    model="gpt-4o"
):
    print(chunk.delta, end="", flush=True)
```


## Project Management

```python
from cencori.types import CreateProjectParams

# List projects
projects = cencori.projects.list(org_slug="my-org")

# Create project
project = cencori.projects.create(
    org_slug="my-org",
    params=CreateProjectParams(name="New Project")
)
```

## API Key Management

```python
from cencori.types import CreateAPIKeyParams

# Create API key
key = cencori.api_keys.create(
    project_id="proj_123",
    params=CreateAPIKeyParams(name="Dev Key", environment="dev")
)
print(f"Secret Key: {key.key}") # Only shown once!

# Get key stats
stats = cencori.api_keys.get_stats(project_id="proj_123", key_id=key.id)
```

## Metrics & Analytics

```python
# Get usage metrics for last 24 hours
metrics = cencori.metrics.get(period="24h")

print(f"Total Requests: {metrics.requests.total}")
print(f"Total Cost: ${metrics.cost.total_usd}")
```

## Error Handling

```python
from cencori import (
    Cencori,
    AuthenticationError,
    RateLimitError,
    SafetyError
)

try:
    response = cencori.ai.chat(messages=[...])
except AuthenticationError:
    print("Invalid API key")
except RateLimitError:
    print("Too many requests")
except SafetyError as e:
    print(f"Content blocked: {e.reasons}")
```

## Supported Models

| Provider | Models |
|----------|--------|
| OpenAI | `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| Anthropic | `claude-3-opus`, `claude-3-sonnet`, `claude-3-haiku` |
| Google | `gemini-2.5-flash`, `gemini-2.0-flash` |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, workflow, and guidelines.

## License

MIT © FohnAI
