import React from "react";
import { Image as ImageIcon } from "lucide-react";

export function ArtCenterImagePlaceholder({ src, label, compact = false }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [src]);
  return (
    <span className={`art-image-placeholder${compact ? " compact" : ""}${!src || failed ? " empty" : ""}`}>
      {src && !failed ? <img src={src} alt={label} loading="lazy" onError={() => setFailed(true)} /> : <><ImageIcon size={compact ? 17 : 26} strokeWidth={1.5} aria-hidden="true" /><small>{failed ? "加载失败" : `暂无${label}`}</small></>}
    </span>
  );
}
