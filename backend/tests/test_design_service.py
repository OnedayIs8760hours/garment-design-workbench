from unittest.mock import AsyncMock, patch

import pytest
from redis.exceptions import RedisError

from app.config.config import Config
from app.services.design_service import remove_design_draft, remove_design_drafts


@pytest.mark.anyio
async def test_remove_design_draft_deletes_record_and_cache_keys():
    db = AsyncMock()
    redis = AsyncMock()

    with patch("app.services.design_service.delete_design_draft", new=AsyncMock(return_value=True)) as delete_draft:
        deleted = await remove_design_draft(db, redis, 7, "football-shirt", "ORDER-001")

    assert deleted is True
    delete_draft.assert_awaited_once_with(db, 7, "football-shirt", "ORDER-001")
    redis.delete.assert_awaited_once_with(
        Config.get_design_draft_key("7", "football-shirt", "ORDER-001"),
        Config.get_design_draft_key("7", "football-shirt"),
    )


@pytest.mark.anyio
async def test_remove_design_draft_succeeds_when_cache_is_unavailable():
    db = AsyncMock()
    redis = AsyncMock()
    redis.delete.side_effect = RedisError("cache unavailable")

    with patch("app.services.design_service.delete_design_draft", new=AsyncMock(return_value=True)):
        deleted = await remove_design_draft(db, redis, 7, "football-shirt", "ORDER-001")

    assert deleted is True


@pytest.mark.anyio
async def test_remove_design_drafts_deduplicates_keys_and_clears_all_template_caches():
    db = AsyncMock()
    redis = AsyncMock()

    with patch("app.services.design_service.delete_design_drafts", new=AsyncMock(return_value=2)) as delete_drafts:
        deleted = await remove_design_drafts(
            db,
            redis,
            7,
            [("football-shirt", "ORDER-001"), ("football-shirt", "ORDER-001"), ("basketball-shirt", "ORDER-002")],
        )

    assert deleted == 2
    delete_drafts.assert_awaited_once_with(
        db,
        7,
        [("football-shirt", "ORDER-001"), ("basketball-shirt", "ORDER-002")],
    )
    assert redis.delete.await_count == 1
    cache_keys = set(redis.delete.await_args.args)
    assert Config.get_design_draft_key("7", "football-shirt", "ORDER-001") in cache_keys
    assert Config.get_design_draft_key("7", "football-shirt") in cache_keys
    assert Config.get_design_draft_key("7", "basketball-shirt", "ORDER-002") in cache_keys
    assert Config.get_design_draft_key("7", "basketball-shirt") in cache_keys
