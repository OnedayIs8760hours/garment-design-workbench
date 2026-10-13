from pydantic import BaseModel, Field


class PsdUploadInitRequest(BaseModel):
    """创建 PSD 分片上传会话的请求。"""

    filename: str = Field(min_length=1, max_length=255)
    size: int = Field(gt=0)
    content_type: str | None = Field(default=None, max_length=128)
    order_id: str | None = Field(default=None, max_length=128)
    asset_id: str | None = Field(default=None, max_length=128)
    part_size: int | None = Field(default=None, ge=0)


class PsdUploadInitResponse(BaseModel):
    """创建分片上传会话的结果，客户端据此把文件切片并发上传。"""

    session_id: str
    upload_id: str
    object_key: str
    bucket: str
    asset_id: str
    original_name: str
    content_type: str
    size: int
    part_size: int
    total_parts: int


class PsdPartUploadResponse(BaseModel):
    """单个分片上传成功后的结果。"""

    part_number: int
    etag: str
    uploaded_parts: int
    total_parts: int


class PsdPartStatus(BaseModel):
    """已上传分片的元数据，用于断点续传与校验。"""

    part_number: int
    etag: str


class PsdUploadStatusResponse(BaseModel):
    """查询分片上传会话进度。"""

    session_id: str
    object_key: str
    size: int
    part_size: int
    total_parts: int
    completed_parts: list[PsdPartStatus] = Field(default_factory=list)
    complete: bool


class PsdUploadCompleteResponse(BaseModel):
    """分片上传全部完成、合并后的最终对象信息。"""

    asset_id: str
    object_key: str
    bucket: str
    original_name: str
    content_type: str
    size: int
    etag: str | None = None
    url: str
    url_expires_in: int


class PsdUploadAbortResponse(BaseModel):
    """中止分片上传的结果。"""

    aborted: bool
    object_key: str