import React from "react";
import { X } from "lucide-react";

export function ArtCenterDialog({ title, subtitle, children, onClose, className = "", footer }) {
  const dialogRef = React.useRef(null);
  const titleId = React.useId();
  React.useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const scrollParent = dialog.closest(".workspace-content");
    const previousScroll = scrollParent ? { top: scrollParent.scrollTop, left: scrollParent.scrollLeft } : null;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      if (scrollParent?.isConnected && previousScroll) {
        scrollParent.scrollTop = previousScroll.top;
        scrollParent.scrollLeft = previousScroll.left;
      }
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`art-center-modal ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
      <header className="art-modal-header"><div>{subtitle && <p>{subtitle}</p>}<h2 id={titleId}>{title}</h2></div><button type="button" className="art-button art-icon-button" onClick={onClose} aria-label="关闭弹窗" autoFocus><X size={19} /></button></header>
      <div className="art-modal-body">{children}</div>
      <footer className="art-modal-footer">{footer || <><span>ERP 美工中心</span><button type="button" className="art-button" onClick={onClose}>关闭</button></>}</footer>
    </dialog>
  );
}
