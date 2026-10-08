from pydantic import BaseModel, Field


class AssetUploadResponse(BaseModel):
    """RustFS 图片上传结果。"""

    asset_id: str
    object_key: str
    bucket: str
    original_name: str
    content_type: str
    size: int
    etag: str | None = None
    url: str
    url_expires_in: int


class AssetObjectResponse(BaseModel):
    """RustFS 对象元数据和临时访问地址。"""

    object_key: str
    bucket: str
    content_type: str
    size: int
    etag: str | None = None
    url: str
    url_expires_in: int


class AssetDeleteResponse(BaseModel):
    """RustFS 图片删除结果。"""

    deleted: bool
    object_key: str


class StorageHealthResponse(BaseModel):
    """RustFS 连接和桶状态。"""

    status: str = Field(description="ok 表示 RustFS 可连接且目标桶存在")
    endpoint: str
    bucket: str
