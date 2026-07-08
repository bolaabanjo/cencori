"""Memory module for vector storage and semantic search."""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

from .types import (
    CreateNamespaceOptions,
    Memory,
    MemoryNamespace,
    SearchMemoryOptions,
    SearchResult,
    StoreMemoryOptions,
)

if TYPE_CHECKING:
    from .client import Cencori


class MemoryModule:
    """
    Module for vector storage, semantic search, and RAG namespaces.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def create_namespace(self, options: CreateNamespaceOptions) -> MemoryNamespace:
        """
        Create a new memory namespace.

        Args:
            options: Namespace creation options

        Returns:
            Created MemoryNamespace
        """
        payload: Dict[str, Any] = {"name": options.name}
        if options.description is not None:
            payload["description"] = options.description
        if options.embedding_model is not None:
            payload["embeddingModel"] = options.embedding_model
        if options.dimensions is not None:
            payload["dimensions"] = options.dimensions
        if options.metadata is not None:
            payload["metadata"] = options.metadata

        data = self._client._request("POST", "/api/memory/namespaces", json=payload)
        return MemoryNamespace(
            id=data.get("id", ""),
            name=data.get("name", ""),
            description=data.get("description"),
            embedding_model=data.get("embeddingModel", ""),
            dimensions=data.get("dimensions", 0),
            metadata=data.get("metadata"),
            memory_count=data.get("memoryCount"),
            created_at=data.get("createdAt", ""),
        )

    def list_namespaces(self) -> List[MemoryNamespace]:
        """
        List all memory namespaces for the project.

        Returns:
            List of MemoryNamespace objects
        """
        data = self._client._request("GET", "/api/memory/namespaces")
        return [
            MemoryNamespace(
                id=ns.get("id", ""),
                name=ns.get("name", ""),
                description=ns.get("description"),
                embedding_model=ns.get("embeddingModel", ""),
                dimensions=ns.get("dimensions", 0),
                metadata=ns.get("metadata"),
                memory_count=ns.get("memoryCount"),
                created_at=ns.get("createdAt", ""),
            )
            for ns in data.get("namespaces", [])
        ]

    def store(self, options: StoreMemoryOptions) -> Memory:
        """
        Store a memory in a namespace.

        Args:
            options: Memory storage options

        Returns:
            Stored Memory
        """
        payload: Dict[str, Any] = {
            "namespace": options.namespace,
            "content": options.content,
        }
        if options.embedding is not None:
            payload["embedding"] = options.embedding
        if options.metadata is not None:
            payload["metadata"] = options.metadata
        if options.expires_at is not None:
            payload["expiresAt"] = options.expires_at

        data = self._client._request("POST", "/api/memory/store", json=payload)
        return self._parse_memory(data)

    def search(self, options: SearchMemoryOptions) -> SearchResult:
        """
        Semantic search across memories in a namespace.

        Args:
            options: Search options

        Returns:
            SearchResult with matching memories
        """
        payload: Dict[str, Any] = {
            "namespace": options.namespace,
            "query": options.query,
        }
        if options.limit is not None:
            payload["limit"] = options.limit
        if options.threshold is not None:
            payload["threshold"] = options.threshold
        if options.filter is not None:
            payload["filter"] = options.filter

        data = self._client._request("POST", "/api/memory/search", json=payload)
        return SearchResult(
            results=[self._parse_memory(m) for m in data.get("results", [])],
            query=data.get("query", options.query),
            namespace=data.get("namespace", options.namespace),
            count=data.get("count", 0),
            latency_ms=data.get("latencyMs", 0),
        )

    def get(self, memory_id: str) -> Memory:
        """
        Get a memory by ID.

        Args:
            memory_id: The memory ID

        Returns:
            Memory object
        """
        data = self._client._request("GET", f"/api/memory/{memory_id}")
        return self._parse_memory(data)

    def delete(self, memory_id: str) -> Dict[str, Any]:
        """
        Delete a memory by ID.

        Args:
            memory_id: The memory ID

        Returns:
            Response with deleted status
        """
        return self._client._request("DELETE", f"/api/memory/{memory_id}")

    def store_batch(self, namespace: str, items: List[Dict[str, Any]]) -> List[Memory]:
        """
        Store multiple memories in a namespace.
        Client-side implementation that calls store for each item.

        Args:
            namespace: The namespace to store in
            items: List of dicts with 'content' and optional 'metadata'

        Returns:
            List of stored Memory objects
        """
        results = []
        for item in items:
            opts = StoreMemoryOptions(
                namespace=namespace,
                content=item["content"],
                metadata=item.get("metadata"),
            )
            results.append(self.store(opts))
        return results

    def delete_by_filter(self, namespace: str, filter: Dict[str, Any]) -> Dict[str, int]:
        """
        Delete all memories in a namespace matching a filter.
        Client-side implementation that searches then deletes.

        Args:
            namespace: The namespace
            filter: Filter criteria

        Returns:
            Dict with 'deleted' count
        """
        search_result = self.search(SearchMemoryOptions(
            namespace=namespace,
            query="*",
            limit=1000,
            threshold=0,
            filter=filter,
        ))
        deleted = 0
        for mem in search_result.results:
            self.delete(mem.id)
            deleted += 1
        return {"deleted": deleted}

    def _parse_memory(self, data: Dict[str, Any]) -> Memory:
        return Memory(
            id=data.get("id", ""),
            namespace=data.get("namespace", ""),
            content=data.get("content", ""),
            metadata=data.get("metadata"),
            similarity=data.get("similarity"),
            expires_at=data.get("expiresAt"),
            created_at=data.get("createdAt", ""),
            updated_at=data.get("updatedAt"),
        )
