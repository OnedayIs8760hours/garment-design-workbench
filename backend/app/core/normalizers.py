"""
文本规范化工具函数
"""

def normalize_username(username: str) -> str:
    """规范化用户名。

    输入：原始用户名字符串。
    输出：去除首尾空白后的用户名。
    功能：保证注册、登录和查询使用一致的用户名格式。
    """
    return username.strip()


def normalize_optional_text(value: str | None) -> str | None:
    """规范化可选文本字段。

    输入：可为空的原始文本。
    输出：去除首尾空白的文本；空字符串转换为 ``None``。
    功能：统一职位等可选字段的存储格式。
    """
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None
