"""Errors raised by the local COSMOS model runtime."""


class ProviderError(RuntimeError):
    """Raised when local model inference cannot be used."""

    def __init__(self, message: str, status_code: int | None = None, retryable: bool = False):
        super().__init__(message)
        self.status_code = status_code
        self.retryable = retryable