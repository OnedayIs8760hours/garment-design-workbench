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
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: int) -> tuple[str, str]:
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
    return jwt.decode(
        token,
        Config.get_jwt_secret_key(),
        algorithms=[Config.JWT_ALGORITHM],
    )
