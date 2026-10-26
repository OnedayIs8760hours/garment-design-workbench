import React from "react";
import { Image as ImageIcon } from "lucide-react";

export function ArtCenterImagePlaceholder({ label, compact = false }) {
  return (
    <span className={`art-image-placeholder${compact ? " compact" : ""}`} aria-label={`${label}演示预览`}>
      <ImageIcon size={compact ? 14 : 22} strokeWidth={1.5} aria-hidden="true" />
      <small>{label}</small>
    </span>
  );
}
