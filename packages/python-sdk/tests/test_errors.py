"""Tests for error classes."""

from cencori.errors import (
    AuthenticationError,
    CencoriError,
    InsufficientCreditsError,
    ProviderError,
    RateLimitError,
    SafetyError,
)


class TestCencoriError:
    """Test base CencoriError."""

    def test_basic_error(self) -> None:
        """Test basic error creation."""
        error = CencoriError("Something went wrong")

        assert str(error) == "Something went wrong"
        assert error.message == "Something went wrong"
        assert error.status_code is None
        assert error.code is None

    def test_error_with_status_code(self) -> None:
        """Test error with status code."""
        error = CencoriError("Server error", status_code=500)

        assert "500" in str(error)
        assert error.status_code == 500

    def test_error_with_code(self) -> None:
        """Test error with code."""
        error = CencoriError("Error", status_code=400, code="BAD_REQUEST")

        assert "BAD_REQUEST" in str(error)
        assert error.code == "BAD_REQUEST"


class TestAuthenticationError:
    """Test AuthenticationError."""

    def test_default_message(self) -> None:
        """Test default error message."""
        error = AuthenticationError()

        assert "Invalid API key" in str(error)
        assert error.status_code == 401
        assert error.code == "INVALID_API_KEY"

    def test_custom_message(self) -> None:
        """Test custom error message."""
        error = AuthenticationError("API key expired")

        assert "API key expired" in str(error)

    def test_is_cencori_error(self) -> None:
        """Test that it inherits from CencoriError."""
        error = AuthenticationError()
        assert isinstance(error, CencoriError)


class TestRateLimitError:
    """Test RateLimitError."""

    def test_default_message(self) -> None:
        """Test default error message."""
        error = RateLimitError()

        assert "Rate limit exceeded" in str(error)
        assert error.status_code == 429
        assert error.code == "RATE_LIMIT_EXCEEDED"

    def test_is_cencori_error(self) -> None:
        """Test that it inherits from CencoriError."""
        error = RateLimitError()
        assert isinstance(error, CencoriError)


class TestSafetyError:
    """Test SafetyError."""

    def test_default_message(self) -> None:
        """Test default error message."""
        error = SafetyError()

        assert "safety violation" in str(error).lower()
        assert error.status_code == 400
        assert error.code == "SAFETY_VIOLATION"

    def test_with_reasons(self) -> None:
        """Test error with reasons."""
        reasons = ["harmful_content", "pii_detected"]
        error = SafetyError(reasons=reasons)

        assert error.reasons == reasons

    def test_empty_reasons_default(self) -> None:
        """Test that reasons defaults to empty list."""
        error = SafetyError()
        assert error.reasons == []


class TestInsufficientCreditsError:
    """Test InsufficientCreditsError."""

    def test_default_message(self) -> None:
        """Test default error message."""
        error = InsufficientCreditsError()

        assert "Insufficient credits" in str(error)
        assert error.status_code == 402
        assert error.code == "INSUFFICIENT_CREDITS"


class TestProviderError:
    """Test ProviderError."""

    def test_default_message(self) -> None:
        """Test default error message."""
        error = ProviderError()

        assert "Provider error" in str(error)
        assert error.status_code == 502
        assert error.code == "PROVIDER_ERROR"
