"""Custom error classes for Cencori SDK."""

from typing import Optional, List


class CencoriError(Exception):
    """
    Base exception for Cencori SDK errors.

    All Cencori-specific errors inherit from this class.
    """

    def __init__(
        self,
        message: str = "An error occurred",
        status_code: Optional[int] = None,
        code: Optional[str] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code

    def __str__(self) -> str:
        if self.code and self.status_code:
            return f"{self.message} (code: {self.code}, status: {self.status_code})"
        if self.status_code:
            return f"{self.message} (status: {self.status_code})"
        return self.message


class AuthenticationError(CencoriError):
    """
    Raised when API key is invalid or missing.

    This error occurs when:
    - The API key is not provided
    - The API key is invalid or revoked
    - The API key doesn't have permission for the requested operation
    """

    def __init__(self, message: str = "Invalid API key"):
        super().__init__(message, status_code=401, code="INVALID_API_KEY")


class RateLimitError(CencoriError):
    """
    Raised when rate limit is exceeded.

    This error occurs when you've made too many requests in a short period.
    Consider implementing exponential backoff retry logic.
    """

    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, status_code=429, code="RATE_LIMIT_EXCEEDED")


class SafetyError(CencoriError):
    """
    Raised when content violates safety policies.

    This error occurs when the input or output is blocked by
    content safety filters.

    Attributes:
        reasons: List of reasons why the content was blocked
    """

    def __init__(
        self,
        message: str = "Content safety violation",
        reasons: Optional[List[str]] = None,
    ):
        super().__init__(message, status_code=400, code="SAFETY_VIOLATION")
        self.reasons = reasons or []


class InsufficientCreditsError(CencoriError):
    """
    Raised when account has insufficient credits.

    This error occurs when your account doesn't have enough
    credits to complete the request.
    """

    def __init__(self, message: str = "Insufficient credits"):
        super().__init__(message, status_code=402, code="INSUFFICIENT_CREDITS")


class ProviderError(CencoriError):
    """
    Raised when the upstream provider returns an error.

    This error occurs when OpenAI, Anthropic, or Google
    returns an error that should be retried.
    """

    def __init__(self, message: str = "Provider error"):
        super().__init__(message, status_code=502, code="PROVIDER_ERROR")
