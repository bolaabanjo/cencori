import os

from cencori import Cencori
from cencori.types import CreateAPIKeyParams, CreateProjectParams


def main():
    # Initialize client
    api_key = os.environ.get("CENCORI_API_KEY")
    if not api_key:
        print("Please set CENCORI_API_KEY environment variable")
        return

    client = Cencori(api_key=api_key)
    print("🚀 Initialized Cencori client")

    # 1. Chat Completion
    print("\n--- Chat Completion ---")
    response = client.ai.chat(
        messages=[{"role": "user", "content": "Hello! say 'Cencori is awesome'"}], model="gpt-4o"
    )
    print(f"Response: {response.content}")

    # 2. Embeddings
    print("\n--- Embeddings ---")
    embedding = client.ai.embeddings(input="Cencori AI Infrastructure")
    print(f"Embedding generated (dim: {len(embedding.embeddings[0])})")

    # 3. Project Management (Mock flow if using a real key without org permissions)
    try:
        print("\n--- Project Management ---")
        # Replace 'your-org-slug' with a real one to test
        org_slug = "test-org"

        # Create Project
        project = client.projects.create(
            org_slug=org_slug, params=CreateProjectParams(name="Demo Project", visibility="private")
        )
        print(f"Created project: {project.name} ({project.id})")

        # 4. API Keys
        print("\n--- API Keys ---")
        key = client.api_keys.create(
            project_id=project.id, params=CreateAPIKeyParams(name="Demo Key", environment="test")
        )
        print(f"Created API Key: {key.prefix}...")

        # 5. Metrics
        print("\n--- Metrics ---")
        metrics = client.metrics.get(period="24h")
        print(f"Total Requests (24h): {metrics.requests.total}")

        # Cleanup
        print("\n--- Cleanup ---")
        client.projects.delete(org_slug, project.slug)
        print("Deleted project")

    except Exception as e:
        print(f"\n⚠️ Skipped Admin/Management steps (requires org admin permissions): {e}")


if __name__ == "__main__":
    main()
