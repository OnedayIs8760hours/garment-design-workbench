"""
安全相关的工具函数，包括密码哈希、验证以及 JWT 访问令牌的创建和解码
"""

from datetime import UTC, datetime, timedelta
from secrets import token_urlsafe
from typing import Any

import jwt
from pwdlib import PasswordHash

from app.config.config import Config


password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    """使用推荐密码哈希算法生成密码摘要。

    输入：密码明文（仅在注册或密码变更流程中短暂存在）。
    输出：可持久化保存的密码哈希字符串。
    功能：避免数据库保存密码明文。
    """
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    """验证密码明文是否匹配已有哈希。

    输入：登录提交的密码明文和数据库中的密码哈希。
    输出：匹配返回 ``True``，否则返回 ``False``。
    功能：供登录业务判断凭据是否正确。
    """
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int) -> tuple[str, str]:
    """为用户创建 JWT 访问令牌和随机会话 ID。

    输入：用户 ID。
    输出：``(jwt_token, session_id)`` 元组；JWT 包含用户 ID、会话 ID、签发时间和过期时间。
    功能：为后续 Bearer 认证和 Redis 会话绑定提供凭据。
    """
    session_id = token_urlsafe(32)
    now = datetime.now(UTC)
    expires_at = now + timedelta(minutes=Config.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": str(user_id),
        "sid": session_id,
        "iat": now,
        "exp": expires_at,
    }
    token = jwt.encode(
        payload,
        Config.get_jwt_secret_key(),
        algorithm=Config.JWT_ALGORITHM,
    )
    return token, session_id


def decode_access_token(token: str) -> dict[str, Any]:
    """验证并解析 JWT 访问令牌。

    输入：客户端提交的 JWT 字符串。
    输出：解码后的 payload 字典。
    功能：校验签名和有效期；无效 token 由 ``jwt`` 抛出异常并由认证依赖转换为 401。
    """
    return jwt.decode(
        token,
        Config.get_jwt_secret_key(),
        algorithms=[Config.JWT_ALGORITHM],
    )
