"""
Vision module — analyze, describe, OCR, and classify images.

Example:
    >>> from cencori import Cencori
    >>> cencori = Cencori(api_key="csk_...")
    >>>
    >>> # From a URL
    >>> result = cencori.vision.analyze(
    ...     image_url="https://example.com/photo.jpg",
    ...     prompt="What breed of dog is this?",
    ... )
    >>> print(result["analysis"])
    >>>
    >>> # From a local file
    >>> import base64
    >>> with open("receipt.png", "rb") as f:
    ...     b64 = base64.b64encode(f.read()).decode()
    >>> ocr = cencori.vision.ocr(image_base64=b64, mime_type="image/png")
    >>> print(ocr["text"])
"""

from typing import TYPE_CHECKING, Any, Dict, List, Optional

if TYPE_CHECKING:
    from .client import Cencori


class VisionModule:
    """
    Vision module for image analysis.

    Accessed via ``cencori.vision``. All methods accept either an ``image_url``
    (https:// or data:) or an ``image_base64`` + ``mime_type``.
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    def analyze(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        images: Optional[List[Dict[str, str]]] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        response_format: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Analyze an image with a vision-capable model.

        Provide one of:
          - ``image_url``
          - ``image_base64`` + ``mime_type``
          - ``images`` — list of ``{'url': ...}`` or ``{'base64': ..., 'mime_type': ...}``

        Returns:
            Dict with keys ``analysis``, ``model``, ``provider``, ``usage``, ``cost``.
        """
        return self._client._request(
            "POST",
            "/api/ai/vision",
            json=self._build_body(
                image_url=image_url,
                image_base64=image_base64,
                mime_type=mime_type,
                images=images,
                prompt=prompt,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                response_format=response_format,
            ),
        )

    def describe(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Describe an image in rich detail."""
        return self._client._request(
            "POST",
            "/api/ai/vision/describe",
            json=self._build_body(
                image_url=image_url,
                image_base64=image_base64,
                mime_type=mime_type,
                model=model,
                max_tokens=max_tokens,
            ),
        )

    def ocr(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Extract all text visible in an image."""
        return self._client._request(
            "POST",
            "/api/ai/vision/ocr",
            json=self._build_body(
                image_url=image_url,
                image_base64=image_base64,
                mime_type=mime_type,
                model=model,
            ),
        )

    def classify(
        self,
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        model: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Classify an image and return structured tags + categories."""
        return self._client._request(
            "POST",
            "/api/ai/vision/classify",
            json=self._build_body(
                image_url=image_url,
                image_base64=image_base64,
                mime_type=mime_type,
                model=model,
            ),
        )

    # ── async variants ─────────────────────────────────────────

    async def a_analyze(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`analyze`."""
        return await self._client._async_request(
            "POST", "/api/ai/vision", json=self._build_body(**kwargs)
        )

    async def a_describe(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`describe`."""
        return await self._client._async_request(
            "POST", "/api/ai/vision/describe", json=self._build_body(**kwargs)
        )

    async def a_ocr(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`ocr`."""
        return await self._client._async_request(
            "POST", "/api/ai/vision/ocr", json=self._build_body(**kwargs)
        )

    async def a_classify(self, **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`classify`."""
        return await self._client._async_request(
            "POST", "/api/ai/vision/classify", json=self._build_body(**kwargs)
        )

    @staticmethod
    def _build_body(
        image_url: Optional[str] = None,
        image_base64: Optional[str] = None,
        mime_type: Optional[str] = None,
        images: Optional[List[Dict[str, str]]] = None,
        prompt: Optional[str] = None,
        model: Optional[str] = None,
        max_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        response_format: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not image_url and not image_base64 and not images:
            raise ValueError("vision request requires image_url, image_base64, or images")

        body: Dict[str, Any] = {}
        if images:
            body["images"] = images
        elif image_url:
            body["image_url"] = image_url
        else:
            body["image_base64"] = image_base64
            if mime_type:
                body["mime_type"] = mime_type
        if prompt is not None:
            body["prompt"] = prompt
        if model is not None:
            body["model"] = model
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        if temperature is not None:
            body["temperature"] = temperature
        if response_format is not None:
            body["response_format"] = response_format
        return body
