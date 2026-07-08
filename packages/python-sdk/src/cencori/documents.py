"""
Documents module — extract text from PDFs and images, summarize, query.

Example:
    >>> from cencori import Cencori
    >>> cencori = Cencori()
    >>>
    >>> # Extract text from a PDF (native, no LLM cost)
    >>> result = cencori.documents.extract(
    ...     document_url="https://example.com/contract.pdf"
    ... )
    >>> print(result["text"])
    >>>
    >>> # Summarize
    >>> summary = cencori.documents.summarize(document_url="https://example.com/report.pdf")
    >>> print(summary["summary"])
    >>>
    >>> # Query
    >>> answer = cencori.documents.query(
    ...     document_url="https://example.com/report.pdf",
    ...     question="What is Q3 revenue?",
    ... )
    >>> print(answer["answer"])
"""

from typing import TYPE_CHECKING, Any, Dict, Optional

if TYPE_CHECKING:
    from .client import Cencori


class DocumentsModule:
    """
    Documents module for PDF and image text extraction, summarization,
    and question-answering.

    Accessed via ``cencori.documents``. All methods accept either a
    ``document_url`` (https://) or ``document_base64`` + ``mime_type``.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def extract(
        self,
        document_url: Optional[str] = None,
        document_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        filename: Optional[str] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract text from a PDF or image.

        PDFs use native text extraction (free — no LLM call). Images route
        through Vision OCR.

        Returns dict with ``text``, ``pageCount``, ``kind``, ``method``,
        and optionally ``model``, ``provider``, ``usage``, ``cost``.
        """
        return self._client._request(
            "POST",
            "/api/ai/documents/extract",
            json=self._build_body(
                document_url=document_url,
                document_base64=document_base64,
                mime_type=mime_type,
                filename=filename,
                prompt=prompt,
                model=model,
            ),
        )

    def summarize(
        self,
        document_url: Optional[str] = None,
        document_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        filename: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract then summarize the document.

        Returns dict with ``summary``, ``text``, ``pageCount``, ``model``,
        ``provider``, ``extractMethod``, ``usage``, ``cost``.
        """
        return self._client._request(
            "POST",
            "/api/ai/documents/summarize",
            json=self._build_body(
                document_url=document_url,
                document_base64=document_base64,
                mime_type=mime_type,
                filename=filename,
                model=model,
            ),
        )

    def query(
        self,
        question: str,
        document_url: Optional[str] = None,
        document_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        filename: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract then answer a question about the document.

        Returns dict with ``answer``, ``question``, ``pageCount``, ``model``,
        ``provider``, ``extractMethod``, ``usage``, ``cost``.
        """
        if not question:
            raise ValueError("documents.query requires a `question`")
        return self._client._request(
            "POST",
            "/api/ai/documents/query",
            json=self._build_body(
                document_url=document_url,
                document_base64=document_base64,
                mime_type=mime_type,
                filename=filename,
                model=model,
                question=question,
            ),
        )

    # ── async variants ─────────────────────────────────────────

    async def a_extract(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`extract`."""
        return await self._client._async_request(
            "POST", "/api/ai/documents/extract", json=self._build_body(**kwargs)
        )

    async def a_summarize(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`summarize`."""
        return await self._client._async_request(
            "POST", "/api/ai/documents/summarize", json=self._build_body(**kwargs)
        )

    async def a_query(self, question: str, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`query`."""
        if not question:
            raise ValueError("documents.query requires a `question`")
        return await self._client._async_request(
            "POST",
            "/api/ai/documents/query",
            json=self._build_body(question=question, **kwargs),
        )

    @staticmethod
    def _build_body(
        document_url: Optional[str] = None,
        document_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        filename: Optional[str] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        question: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not document_url and not document_base64:
            raise ValueError("documents request requires document_url or document_base64")

        body: Dict[str, Any] = {}
        if document_url:
            body["document_url"] = document_url
        else:
            body["document_base64"] = document_base64
            if mime_type:
                body["mime_type"] = mime_type
            if filename:
                body["filename"] = filename
        if prompt is not None:
            body["prompt"] = prompt
        if model is not None:
            body["model"] = model
        if question is not None:
            body["question"] = question
        return body
