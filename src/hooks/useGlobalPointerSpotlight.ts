import React from 'react';

const surfaceSelector = [
  '.interactive-surface:not(.interactive-surface-disabled)',
  '.ui-card',
  '.comment-card',
  '.prototype-frame',
  '.archive-preview',
  '.archive-item',
  '.message-card',
  '.debug-console',
  '.loading-panel',
  '.setup-intro',
  '.setup-grid > form',
  '.join-panel',
  '.archive-hero',
  '.study-stats > div',
  '[data-spotlight-surface]',
  '[data-tooltip]',
].join(',');

export function useGlobalPointerSpotlight() {
  React.useEffect(() => {
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!supportsHover.matches) return;

    document.getElementById('custom-cursor')?.remove();
    const cursor = document.createElement('div');
    cursor.id = 'custom-cursor';
    cursor.className = 'custom-cursor-glow';
    cursor.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cursor);
    document.documentElement.classList.add('custom-cursor-active');

    let active: HTMLElement | null = null;
    let frame: number | null = null;
    let cursorFrame: number | null = null;
    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;
    let cursorTargetX = 0;
    let cursorTargetY = 0;
    let cursorX = 0;
    let cursorY = 0;
    let cursorReady = false;

    const renderCursor = () => {
      const easing = reducedMotion.matches ? 1 : .28;
      cursorX += (cursorTargetX - cursorX) * easing;
      cursorY += (cursorTargetY - cursorY) * easing;
      cursor.style.setProperty('--cursor-x', `${cursorX.toFixed(2)}px`);
      cursor.style.setProperty('--cursor-y', `${cursorY.toFixed(2)}px`);

      const moving = Math.abs(cursorTargetX - cursorX) > .1 || Math.abs(cursorTargetY - cursorY) > .1;
      cursorFrame = moving ? window.requestAnimationFrame(renderCursor) : null;
    };

    const scheduleCursor = () => {
      if (cursorFrame === null) cursorFrame = window.requestAnimationFrame(renderCursor);
    };

    const render = () => {
      if (!active) {
        frame = null;
        return;
      }

      const easing = reducedMotion.matches ? 1 : .22;
      currentX += (targetX - currentX) * easing;
      currentY += (targetY - currentY) * easing;
      active.style.setProperty('--pointer-x', `${currentX.toFixed(2)}%`);
      active.style.setProperty('--pointer-y', `${currentY.toFixed(2)}%`);

      const moving = Math.abs(targetX - currentX) > .08 || Math.abs(targetY - currentY) > .08;
      frame = moving ? window.requestAnimationFrame(render) : null;
    };

    const schedule = () => {
      if (frame === null) frame = window.requestAnimationFrame(render);
    };

    const leaveActive = () => {
      active?.classList.remove('pointer-spotlight-active');
      active = null;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      currentX = 50;
      currentY = 50;
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      cursorTargetX = event.clientX;
      cursorTargetY = event.clientY;
      if (!cursorReady) {
        cursorX = cursorTargetX;
        cursorY = cursorTargetY;
        cursorReady = true;
      }
      cursor.classList.add('is-visible');
      scheduleCursor();

      const surface = (event.target as Element | null)?.closest(surfaceSelector) as HTMLElement | null;
      if (!surface) {
        leaveActive();
        return;
      }

      if (surface !== active) {
        active?.classList.remove('pointer-spotlight-active');
        active = surface;
        currentX = 50;
        currentY = 50;
        active.classList.add('pointer-spotlight-active');
      }

      const rect = surface.getBoundingClientRect();
      targetX = Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100));
      targetY = Math.min(100, Math.max(0, ((event.clientY - rect.top) / rect.height) * 100));
      schedule();
    };

    const onPointerOut = (event: PointerEvent) => {
      if (!active || active.contains(event.relatedTarget as Node | null)) return;
      leaveActive();
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'touch') cursor.classList.add('is-pressed');
    };

    const onPointerUp = () => cursor.classList.remove('is-pressed', 'is-dragging');
    const onDocumentLeave = () => {
      cursor.classList.remove('is-visible', 'is-pressed', 'is-draggable', 'is-dragging');
      leaveActive();
    };

    document.addEventListener('pointermove', onPointerMove, { passive: true });
    document.addEventListener('pointerout', onPointerOut, { passive: true });
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('mouseleave', onDocumentLeave, { passive: true });
    window.addEventListener('blur', onDocumentLeave);
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerout', onPointerOut);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('mouseleave', onDocumentLeave);
      window.removeEventListener('blur', onDocumentLeave);
      if (cursorFrame !== null) window.cancelAnimationFrame(cursorFrame);
      cursor.remove();
      document.documentElement.classList.remove('custom-cursor-active');
      leaveActive();
    };
  }, []);
}
