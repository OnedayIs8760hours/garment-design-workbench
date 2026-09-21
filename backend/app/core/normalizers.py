def normalize_username(username: str) -> str:
    return username.strip()


def normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
