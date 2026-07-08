"""Example usage of Cencori Python SDK."""

from cencori import AuthenticationError, Cencori, RateLimitError, SafetyError

# Initialize client
cencori = Cencori(api_key="your-api-key")


# Example 1: Basic chat
def basic_chat():
    response = cencori.ai.chat(
        messages=[{"role": "user", "content": "What is the capital of France?"}],
        model="gpt-4o",
    )

    print(f"Response: {response.content}")
    print(f"Model: {response.model}")
    print(f"Cost: ${response.cost_usd:.6f}")
    print(f"Tokens: {response.usage.total_tokens}")


# Example 2: Streaming
def streaming_chat():
    print("Streaming response: ", end="")

    for chunk in cencori.ai.chat_stream(
        messages=[{"role": "user", "content": "Tell me a short story about a robot."}],
        model="gpt-4o",
    ):
        print(chunk.delta, end="", flush=True)

    print()  # New line at the end


# Example 3: Error handling
def error_handling():
    try:
        response = cencori.ai.chat(
            messages=[{"role": "user", "content": "Hello!"}],
        )
        print(response.content)
    except AuthenticationError:
        print("Error: Invalid API key")
    except RateLimitError:
        print("Error: Rate limit exceeded, please slow down")
    except SafetyError as e:
        print(f"Error: Content blocked - {e.reasons}")


# Example 4: Multi-turn conversation
def conversation():
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": "My name is Alice."},
    ]

    response1 = cencori.ai.chat(messages=messages, model="gpt-4o")
    print(f"Assistant: {response1.content}")

    # Add assistant response and user follow-up
    messages.append({"role": "assistant", "content": response1.content})
    messages.append({"role": "user", "content": "What's my name?"})

    response2 = cencori.ai.chat(messages=messages, model="gpt-4o")
    print(f"Assistant: {response2.content}")


if __name__ == "__main__":
    print("=== Basic Chat ===")
    basic_chat()

    print("\n=== Streaming ===")
    streaming_chat()

    print("\n=== Error Handling ===")
    error_handling()

    print("\n=== Conversation ===")
    conversation()
