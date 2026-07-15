import React from 'react';

const PREVIEW_CURSOR_STYLE_ID = 'vibecoding-preview-cursor-style';

const previewCursorCss = `
@media (hover: hover) and (pointer: fine) {
  html,
  body,
  body *,
  [draggable="true"],
  [data-draggable],
  .is-dragging {
    cursor: none !important;
  }
}

@media (hover: none), (pointer: coarse) {
  html,
  body,
  body * {
    cursor: auto !important;
  }
}
`;

function addCursorStyleToSrcDoc(srcDoc?: string) {
  if (!srcDoc || srcDoc.includes(`id="${PREVIEW_CURSOR_STYLE_ID}"`)) return srcDoc;
  const styleTag = `<style id="${PREVIEW_CURSOR_STYLE_ID}">${previewCursorCss}</style>`;
  if (/<\/head>/i.test(srcDoc)) return srcDoc.replace(/<\/head>/i, `${styleTag}</head>`);
  return `${styleTag}${srcDoc}`;
}

type CursorSafeIframeProps = Omit<React.IframeHTMLAttributes<HTMLIFrameElement>, 'ref'>;

function isInteractivePreviewTarget(target: EventTarget | null, previewWindow: Window) {
  const element = target as Element | null;
  if (!element || typeof element.closest !== 'function') return false;

  const declaredInteractive = element.closest(
    'button, a, [role="button"], [draggable="true"], [data-draggable], .is-dragging',
  );
  const nativeCursor = previewWindow.getComputedStyle(element).cursor;
  return Boolean(declaredInteractive) || nativeCursor === 'grab' || nativeCursor === 'grabbing' || nativeCursor === 'pointer';
}

export function CursorSafeIframe({ onLoad, srcDoc, ...props }: CursorSafeIframeProps) {
  const iframeRef = React.useRef<HTMLIFrameElement>(null);
  const removeBridgeRef = React.useRef<() => void>(() => undefined);

  const connectCursorBridge = React.useCallback(() => {
    removeBridgeRef.current();

    const iframe = iframeRef.current;
    const previewDocument = iframe?.contentDocument;
    const previewWindow = iframe?.contentWindow;
    if (!iframe || !previewDocument || !previewWindow) return;

    if (!previewDocument.getElementById(PREVIEW_CURSOR_STYLE_ID)) {
      const style = previewDocument.createElement('style');
      style.id = PREVIEW_CURSOR_STYLE_ID;
      style.textContent = previewCursorCss;
      (previewDocument.head || previewDocument.documentElement).appendChild(style);
    }

    const outerCursor = () => document.getElementById('custom-cursor');

    const forwardPointer = (type: string, event: PointerEvent) => {
      const rect = iframe.getBoundingClientRect();
      iframe.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        clientX: rect.left + event.clientX,
        clientY: rect.top + event.clientY,
        pointerId: event.pointerId,
        pointerType: event.pointerType || 'mouse',
        isPrimary: event.isPrimary,
        buttons: event.buttons,
      }));
    };

    const onPointerMove = (event: PointerEvent) => {
      const interactive = isInteractivePreviewTarget(event.target, previewWindow);
      outerCursor()?.classList.toggle('is-draggable', interactive);
      forwardPointer('pointermove', event);
    };

    const onPointerDown = (event: PointerEvent) => {
      if (isInteractivePreviewTarget(event.target, previewWindow)) {
        outerCursor()?.classList.add('is-dragging');
      }
      forwardPointer('pointerdown', event);
    };

    const onPointerUp = (event: PointerEvent) => {
      outerCursor()?.classList.remove('is-dragging');
      forwardPointer('pointerup', event);
    };

    const onPointerLeave = (event: PointerEvent) => {
      outerCursor()?.classList.remove('is-draggable', 'is-dragging');
      forwardPointer('pointerout', event);
    };

    previewDocument.addEventListener('pointermove', onPointerMove, { passive: true });
    previewDocument.addEventListener('pointerdown', onPointerDown, { passive: true });
    previewDocument.addEventListener('pointerup', onPointerUp, { passive: true });
    previewDocument.addEventListener('pointercancel', onPointerUp, { passive: true });
    previewDocument.addEventListener('pointerleave', onPointerLeave, { passive: true });

    removeBridgeRef.current = () => {
      previewDocument.removeEventListener('pointermove', onPointerMove);
      previewDocument.removeEventListener('pointerdown', onPointerDown);
      previewDocument.removeEventListener('pointerup', onPointerUp);
      previewDocument.removeEventListener('pointercancel', onPointerUp);
      previewDocument.removeEventListener('pointerleave', onPointerLeave);
      outerCursor()?.classList.remove('is-draggable', 'is-dragging');
    };
  }, []);

  React.useEffect(() => () => removeBridgeRef.current(), []);

  return (
    <iframe
      {...props}
      srcDoc={addCursorStyleToSrcDoc(srcDoc)}
      ref={iframeRef}
      onLoad={(event) => {
        connectCursorBridge();
        onLoad?.(event);
      }}
    />
  );
}
