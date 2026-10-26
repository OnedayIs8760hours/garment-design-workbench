export function materialToDesignAsset(asset, width, height) {
  if (!asset?.asset_id || !asset?.object_key || !(width > 0) || !(height > 0)) {
    throw new Error("素材数据不完整，无法添加到裁片。");
  }
  return {
    assetId: asset.asset_id,
    type: "image",
    name: asset.original_name,
    previewFile: asset.original_name,
    sourceFile: asset.original_name,
    objectKey: asset.object_key,
    bucket: asset.bucket,
    storageProvider: "rustfs",
    contentType: asset.content_type,
    size: asset.size,
    etag: asset.etag,
    dataUrl: asset.url,
    originalWidth: width,
    originalHeight: height,
    uploadedAt: asset.created_at || new Date().toISOString(),
  };
}

export function removeMaterialReferences(draft, deletedKeys) {
  const keys = new Set(deletedKeys);
  const ids = new Set(draft.assets.filter((asset) => keys.has(asset.objectKey)).map((asset) => asset.assetId));
  draft.assets = draft.assets.filter((asset) => !ids.has(asset.assetId));
  Object.values(draft.panels).forEach((panel) => {
    if (!panel.elements.some((element) => ids.has(element.assetId))) return;
    panel.elements = panel.elements.filter((element) => !ids.has(element.assetId))
      .map((element, index) => ({ ...element, zIndex: index + 1 }));
    panel.changed = true;
  });
}
