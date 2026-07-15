"""
Voice module — text-to-speech and speech-to-text across providers.

Example:
    >>> from cencori import Cencori
    >>> cencori = Cencori(api_key="csk_...")
    >>>
    >>> # Text-to-speech (provider inferred from model)
    >>> audio = cencori.voice.speak("Hello from Cencori.", model="aura-asteria-en")
    >>> with open("hello.mp3", "wb") as f:
    ...     f.write(audio)
    >>>
    >>> # Speech-to-text
    >>> result = cencori.voice.transcribe("hello.mp3", model="nova-3")
    >>> print(result["text"])
    >>>
    >>> # With speaker labels
    >>> diarized = cencori.voice.diarize("meeting.mp3", model="assemblyai-universal")
    >>> for seg in diarized["segments"]:
    ...     print(seg["speaker"], seg["text"])
"""

import os
from typing import TYPE_CHECKING, Any, Dict, Optional, Tuple, Union

import httpx

from .errors import (
    AuthenticationError,
    CencoriError,
    InsufficientCreditsError,
    ProviderError,
    RateLimitError,
    SafetyError,
)

if TYPE_CHECKING:
    from .client import Cencori

# Audio may be a path, raw bytes, or an open binary file object.
AudioInput = Union[str, bytes, "os.PathLike[str]", Any]

_TEXT_FORMATS = {"text", "srt", "vtt"}


class VoiceModule:
    """
    Voice module for TTS and STT.

    Accessed via ``cencori.voice``. The provider is inferred from ``model``
    (TTS default ``tts-1``; STT default ``whisper-1``).
    """

    def __init__(self, client: "Cencori") -> None:
        self._client = client

    # ── Text-to-speech ─────────────────────────────────────────

    def speak(
        self,
        input: str,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        provider: Optional[str] = None,
        response_format: Optional[str] = None,
        speed: Optional[float] = None,
        language: Optional[str] = None,
    ) -> bytes:
        """
        Synthesize speech and return the raw audio bytes.

        Provider is inferred from ``model`` (default ``tts-1``). Write the
        result straight to a file, e.g. ``open("out.mp3", "wb").write(audio)``.
        """
        body = _speak_body(input, model, voice, provider, response_format, speed, language)
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(self._url("/api/ai/audio/speech"), json=body, headers=self._headers(json=True))
        return self._audio_bytes(response)

    def transcribe(
        self,
        file: AudioInput,
        model: Optional[str] = None,
        provider: Optional[str] = None,
        language: Optional[str] = None,
        prompt: Optional[str] = None,
        temperature: Optional[float] = None,
        diarize: bool = False,
        response_format: str = "json",
        filename: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Transcribe audio. Provider is inferred from ``model`` (default
        ``whisper-1``). ``file`` may be a path, bytes, or an open binary file.

        Returns a dict with ``text`` and, for ``verbose_json``, ``segments`` /
        ``words`` (with speaker labels when ``diarize=True``).
        """
        files, data = _transcribe_payload(
            file, model, provider, language, prompt, temperature, diarize, response_format, filename
        )
        with httpx.Client(timeout=self._timeout) as client:
            response = client.post(self._url("/api/ai/audio/transcriptions"), files=files, data=data, headers=self._headers())
        return self._transcript(response, response_format)

    def diarize(self, file: AudioInput, model: Optional[str] = None, **kwargs: Any) -> Dict[str, Any]:
        """Transcribe with speaker labels. Use a diarization-capable model
        (``nova-3``, ``assemblyai-universal``)."""
        kwargs.pop("diarize", None)
        kwargs.pop("response_format", None)
        return self.transcribe(file, model=model, diarize=True, response_format="verbose_json", **kwargs)

    def list_models(self) -> Dict[str, Any]:
        """Return ``{'tts': [...], 'stt': [...]}`` of available voice models."""
        with httpx.Client(timeout=self._timeout) as client:
            tts = client.get(self._url("/api/ai/audio/speech"), headers=self._headers())
            stt = client.get(self._url("/api/ai/audio/transcriptions"), headers=self._headers())
        return {
            "tts": tts.json().get("models", []) if tts.is_success else [],
            "stt": stt.json().get("models", []) if stt.is_success else [],
        }

    # ── async variants ─────────────────────────────────────────

    async def a_speak(self, input: str, **kwargs: Any) -> bytes:
        """Async version of :meth:`speak`."""
        body = _speak_body(input, **kwargs)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(self._url("/api/ai/audio/speech"), json=body, headers=self._headers(json=True))
        return self._audio_bytes(response)

    async def a_transcribe(self, file: AudioInput, response_format: str = "json", **kwargs: Any) -> Dict[str, Any]:
        """Async version of :meth:`transcribe`."""
        files, data = _transcribe_payload(file, response_format=response_format, **kwargs)
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.post(self._url("/api/ai/audio/transcriptions"), files=files, data=data, headers=self._headers())
        return self._transcript(response, response_format)

    # ── internals ──────────────────────────────────────────────

    @property
    def _timeout(self) -> Any:
        return self._client._timeout

    def _url(self, path: str) -> str:
        return f"{self._client.get_base_url()}{path}"

    def _headers(self, json: bool = False) -> Dict[str, str]:
        headers = {"CENCORI_API_KEY": self._client.get_api_key()}
        if json:
            headers["Content-Type"] = "application/json"
        return headers

    def _audio_bytes(self, response: httpx.Response) -> bytes:
        if not response.is_success:
            self._raise(response)
        return response.content

    def _transcript(self, response: httpx.Response, response_format: str) -> Dict[str, Any]:
        if not response.is_success:
            self._raise(response)
        if response_format in _TEXT_FORMATS:
            return {"text": response.text, "provider": response.headers.get("x-provider")}
        return response.json()

    @staticmethod
    def _raise(response: httpx.Response) -> None:
        code = response.status_code
        if code == 401:
            raise AuthenticationError()
        if code == 429:
            raise RateLimitError()
        if code == 402:
            raise InsufficientCreditsError()
        if code == 502:
            raise ProviderError()
        try:
            data = response.json()
        except Exception:
            data = {}
        if code == 400 and "reasons" in data:
            raise SafetyError(message=data.get("error", "Content safety violation"), reasons=data.get("reasons", []))
        raise CencoriError(message=data.get("message") or data.get("error", "Request failed"), status_code=code)


def _speak_body(
    input: str,
    model: Optional[str] = None,
    voice: Optional[str] = None,
    provider: Optional[str] = None,
    response_format: Optional[str] = None,
    speed: Optional[float] = None,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    if not input or not input.strip():
        raise ValueError("voice.speak requires non-empty input")
    body: Dict[str, Any] = {"input": input}
    if model is not None:
        body["model"] = model
    if voice is not None:
        body["voice"] = voice
    if provider is not None:
        body["provider"] = provider
    if response_format is not None:
        body["response_format"] = response_format
    if speed is not None:
        body["speed"] = speed
    if language is not None:
        body["language"] = language
    return body


def _transcribe_payload(
    file: AudioInput,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    language: Optional[str] = None,
    prompt: Optional[str] = None,
    temperature: Optional[float] = None,
    diarize: bool = False,
    response_format: str = "json",
    filename: Optional[str] = None,
) -> Tuple[Dict[str, Tuple[str, Any]], Dict[str, str]]:
    if isinstance(file, (str, os.PathLike)):
        name = filename or os.path.basename(os.fspath(file))
        content: Any = open(file, "rb")
    elif isinstance(file, (bytes, bytearray)):
        name = filename or "audio.mp3"
        content = bytes(file)
    else:  # assume a file-like object
        name = filename or getattr(file, "name", "audio.mp3")
        content = file

    files = {"file": (name, content)}
    data: Dict[str, str] = {"response_format": response_format}
    if model is not None:
        data["model"] = model
    if provider is not None:
        data["provider"] = provider
    if language is not None:
        data["language"] = language
    if prompt is not None:
        data["prompt"] = prompt
    if temperature is not None:
        data["temperature"] = str(temperature)
    if diarize:
        data["diarize"] = "true"
    return files, data
