class ProviderError(Exception):
    """An upstream model failed; its raw response must not reach API clients."""


class QuotaUnavailable(Exception):
    """Quota storage failed. Image generation must fail closed."""


class MemoryCapacityExceeded(Exception):
    """All short-term memory slots are currently occupied."""


class AssetStorageError(Exception):
    """An image exists but could not be saved to the authenticated user's storage."""
