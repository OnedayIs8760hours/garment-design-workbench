import pytest

from app.services.object_storage import ObjectStorageError, assert_user_object_key, build_user_object_key


def test_build_user_object_key_scopes_asset_to_user_and_order():
    asset_id, object_key = build_user_object_key(42, "ORDER/危险 001", "image/png")

    assert asset_id.startswith("asset-")
    assert object_key.startswith("users/42/designs/ORDER-001/assets/asset-")
    assert object_key.endswith(".png")


def test_assert_user_object_key_rejects_other_users_and_traversal():
    assert assert_user_object_key(42, "users/42/designs/ORDER-1/assets/a.png") == (
        "users/42/designs/ORDER-1/assets/a.png"
    )

    with pytest.raises(ObjectStorageError, match="current user"):
        assert_user_object_key(42, "users/41/designs/ORDER-1/assets/a.png")

    with pytest.raises(ObjectStorageError, match="current user"):
        assert_user_object_key(42, "users/42/../41/assets/a.png")


def test_build_user_object_key_rejects_unsupported_file_type():
    with pytest.raises(ObjectStorageError, match="Unsupported image type"):
        build_user_object_key(42, "ORDER-1", "image/svg+xml")
