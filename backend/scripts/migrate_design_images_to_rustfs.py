"""将 design_data.assets 中的旧 Base64 图片迁移到 RustFS。

运行方式：
    uv run python scripts/migrate_design_images_to_rustfs.py

脚本是幂等的：已经包含 objectKey 的素材只会清理旧 dataUrl，不会重复上传。
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import io
import json
import re
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from redis.asyncio import Redis
from sqlalchemy import text

from app.config.config import Config
from app.config.db import engine
from app.services.object_storage import ObjectStorageError, upload_image_object


DATA_URL_PATTERN = re.compile(r"^data:(?P<mime>[^;,]+)(?P<base64>;base64)?,(?P<body>.*)$", re.DOTALL)


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    """解析 data URL，返回 MIME 类型和二进制图片。"""
    match = DATA_URL_PATTERN.match(data_url or "")
    if not match:
        raise ValueError("only data URLs can be migrated automatically")
    body = match.group("body")
    if match.group("base64"):
        try:
            content = base64.b64decode(body, validate=True)
        except (binascii.Error, ValueError) as error:
            raise ValueError("invalid base64 image data") from error
    else:
        from urllib.parse import unquote_to_bytes

        content = unquote_to_bytes(body)
    return match.group("mime").lower(), content


def update_asset_reference(asset: dict[str, Any], stored: dict[str, Any]) -> None:
    """将上传结果写回素材元数据，并清除图片内容。"""
    asset.update(
        {
            "assetId": stored["asset_id"],
            "objectKey": stored["object_key"],
            "bucket": stored["bucket"],
            "storageProvider": "rustfs",
            "contentType": stored["content_type"],
            "size": stored["size"],
            "etag": stored["etag"],
        }
    )
    asset.pop("dataUrl", None)
    asset.pop("url", None)


async def migrate() -> None:
    migrated = 0
    skipped = 0
    failed = 0
    redis = Redis(**Config.get_redis_config())
    try:
        async with engine.begin() as conn:
            rows = (
                await conn.execute(
                    text("SELECT id, user_id, template_id, order_id, design_data FROM design_drafts ORDER BY id")
                )
            ).mappings().all()

        for row in rows:
            design = row["design_data"]
            changed = False
            try:
                for asset in design.get("assets") or []:
                    if not isinstance(asset, dict):
                        continue
                    data_url = asset.get("dataUrl")
                    if not data_url:
                        continue
                    if asset.get("objectKey"):
                        asset.pop("dataUrl", None)
                        asset.pop("url", None)
                        changed = True
                        skipped += 1
                        continue

                    content_type, content = decode_data_url(str(data_url))
                    stored = await upload_image_object(
                        user_id=int(row["user_id"]),
                        order_id=str(row["order_id"]),
                        asset_id=str(asset.get("assetId") or "") or None,
                        file_object=io.BytesIO(content),
                        content_type=content_type,
                        size=len(content),
                    )
                    update_asset_reference(asset, stored)
                    changed = True
                    migrated += 1

                if changed:
                    async with engine.begin() as conn:
                        await conn.execute(
                            text(
                                "UPDATE design_drafts SET design_data = CAST(:design AS jsonb), updated_at = CURRENT_TIMESTAMP "
                                "WHERE id = :id"
                            ),
                            {"id": row["id"], "design": json.dumps(design, ensure_ascii=False)},
                        )
                    await redis.delete(
                        Config.get_design_draft_key(str(row["user_id"]), row["template_id"], row["order_id"]),
                        Config.get_design_draft_key(str(row["user_id"]), row["template_id"]),
                    )
                    print(f"migrated draft id={row['id']} template={row['template_id']} order={row['order_id']}")
            except (ObjectStorageError, ValueError, TypeError) as error:
                failed += 1
                print(f"FAILED draft id={row['id']}: {error}")
        print(f"done: migrated={migrated}, cleaned_existing={skipped}, failed={failed}")
        if failed:
            raise SystemExit(1)
    finally:
        await redis.aclose()
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(migrate())
