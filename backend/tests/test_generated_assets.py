from datetime import UTC, datetime
from types import SimpleNamespace

import anyio
import pytest
from botocore.exceptions import ClientError
from fastapi.testclient import TestClient

from app.api.dependencies.auth import get_current_user
from app.main import app
from app.services import object_storage
from app.services.object_storage import ObjectStorageError, delete_image_objects, list_generated_images


class FakeStorage:
    def __init__(self):
        self.list_arguments = None
        self.delete_arguments = None

    def list_objects_v2(self, **arguments):
        self.list_arguments = arguments
        return {"Contents": [{
            "Key": "users/7/designs/generated/assets/a.png", "Size": 4,
            "LastModified": datetime.now(UTC),
        }], "NextContinuationToken": "next-page"}

    def head_object(self, **arguments):
        return {"ContentType": "image/png", "ContentLength": 4, "Metadata": {
            "asset-id": "a", "original-name": "%E8%80%81%E8%99%8E.png",
        }}

    def generate_presigned_url(self, *args, **kwargs):
        return "https://storage.example.com/a.png"

    def delete_objects(self, **arguments):
        self.delete_arguments = arguments
        keys = [item["Key"] for item in arguments["Delete"]["Objects"]]
        return {"Deleted": [{"Key": keys[0]}], "Errors": [{"Key": key} for key in keys[1:]]}


def test_listing_is_user_scoped_paginated_and_decodes_original_filename(monkeypatch):
    client = FakeStorage()
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: client)
    result = anyio.run(list_generated_images, 7, 24, "previous-page")
    assert client.list_arguments["Prefix"] == "users/7/designs/generated/assets/"
    assert client.list_arguments["ContinuationToken"] == "previous-page"
    assert client.list_arguments["MaxKeys"] == 24
    assert result["items"][0]["original_name"] == "老虎.png"
    assert result["next_cursor"] == "next-page"


def test_first_use_returns_empty_library_before_bucket_is_created(monkeypatch):
    client = FakeStorage()

    def missing_bucket(**arguments):
        raise ClientError({"Error": {"Code": "NoSuchBucket"}}, "ListObjectsV2")

    client.list_objects_v2 = missing_bucket
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: client)
    assert anyio.run(list_generated_images, 7, 24) == {"items": [], "next_cursor": None}


def test_batch_deletion_reports_partial_failures_and_deduplicates(monkeypatch):
    client = FakeStorage()
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: client)
    keys = ["users/7/designs/generated/assets/a.png", "users/7/designs/generated/assets/b.png"]
    result = anyio.run(delete_image_objects, 7, [*keys, keys[0]])
    assert result == {"deleted": keys[:1], "failed": keys[1:]}
    assert len(client.delete_arguments["Delete"]["Objects"]) == 2


@pytest.mark.parametrize("bad_key", [
    "users/8/designs/generated/assets/b.png", "users/7/../8/b.png"
])
def test_batch_deletion_validates_entire_batch_before_mutating(monkeypatch, bad_key):
    client = FakeStorage()
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: client)
    with pytest.raises(ObjectStorageError):
        anyio.run(delete_image_objects, 7, ["users/7/designs/generated/assets/a.png", bad_key])
    assert client.delete_arguments is None


def test_library_and_batch_delete_api_contract(monkeypatch):
    storage = FakeStorage()
    monkeypatch.setattr(object_storage, "get_rustfs_client", lambda: storage)
    app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(
        id=7, permissions=["assets.read", "assets.write"])
    try:
        with TestClient(app) as client:
            response = client.get("/api/assets")
            assert response.status_code == 200
            assert response.json()["items"][0]["asset_id"] == "a"
            assert client.get("/api/assets?limit=101").status_code == 422
            assert client.post("/api/assets/batch-delete", json={"object_keys": []}).status_code == 422
            response = client.post("/api/assets/batch-delete", json={
                "object_keys": ["users/7/designs/generated/assets/a.png"]
            })
            assert response.status_code == 200
            assert response.json()["deleted"] == ["users/7/designs/generated/assets/a.png"]
            response = client.post("/api/assets/batch-delete", json={
                "object_keys": ["users/8/designs/generated/assets/a.png"]
            })
            assert response.status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)
