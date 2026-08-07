export type PreviewPerformanceMode = 'interactive' | 'thumbnail';

export const INTERACTIVE_PREVIEW_FPS = 30;
export const THUMBNAIL_PREVIEW_FPS = 5;
export const PLATFORM_PREVIEW_MAX_DPR = 1;
export const STANDALONE_APP_MAX_DPR = 1.5;

const STANDALONE_MARKER = 'data-vibecoding-performance-guard="standalone"';

function insertAtDocumentStart(html: string, snippet: string) {
  const head = /<head\b[^>]*>/i.exec(html);
  if (head?.index != null) {
    const offset = head.index + head[0].length;
    return `${html.slice(0, offset)}\n${snippet}${html.slice(offset)}`;
  }
  const documentElement = /<html\b[^>]*>/i.exec(html);
  if (documentElement?.index != null) {
    const offset = documentElement.index + documentElement[0].length;
    return `${html.slice(0, offset)}\n<head>${snippet}</head>${html.slice(offset)}`;
  }
  return `${snippet}\n${html}`;
}

function animationFrameGuard(maxFps: number, maxDpr: number, marker: string) {
  return `<script ${marker}>
(() => {
  const requestedCap = ${maxFps};
  const requestedDprCap = ${maxDpr};
  const previousCap = Number(window.__VIBECODING_MAX_FPS__);
  window.__VIBECODING_MAX_FPS__ = Number.isFinite(previousCap) && previousCap > 0
    ? Math.min(previousCap, requestedCap)
    : requestedCap;
  const previousDprCap = Number(window.__VIBECODING_MAX_DPR__);
  window.__VIBECODING_MAX_DPR__ = Number.isFinite(previousDprCap) && previousDprCap > 0
    ? Math.min(previousDprCap, requestedDprCap)
    : requestedDprCap;
  if (!window.__VIBECODING_DPR_GUARD__) {
    window.__VIBECODING_DPR_GUARD__ = true;
    const nativeDevicePixelRatio = Math.max(1, Number(window.devicePixelRatio) || 1);
    try {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        get: () => Math.min(
          nativeDevicePixelRatio,
          Math.max(0.5, Number(window.__VIBECODING_MAX_DPR__) || requestedDprCap),
        ),
      });
    } catch {
      // Some embedded browsers expose a non-configurable devicePixelRatio.
    }
  }
  if (window.__VIBECODING_RAF_GUARD__) return;
  window.__VIBECODING_RAF_GUARD__ = true;

  const nativeRequest = window.requestAnimationFrame.bind(window);
  const nativeSetInterval = window.setInterval.bind(window);
  const pending = new Map();
  let nextRequestId = 1;
  let nativeRequestId = null;
  let lastDispatchAt = Number.NEGATIVE_INFINITY;

  const schedule = () => {
    if (nativeRequestId == null && pending.size > 0) nativeRequestId = nativeRequest(dispatch);
  };
  const dispatch = (timestamp) => {
    nativeRequestId = null;
    if (pending.size === 0) return;
    const currentCap = Math.max(1, Number(window.__VIBECODING_MAX_FPS__) || requestedCap);
    const minimumFrameTime = 1000 / currentCap;
    if (!document.hidden && timestamp - lastDispatchAt + 0.01 >= minimumFrameTime) {
      lastDispatchAt = timestamp;
      const callbacks = Array.from(pending.entries());
      pending.clear();
      callbacks.forEach(([, callback]) => {
        try {
          callback(timestamp);
        } catch (error) {
          window.setTimeout(() => { throw error; }, 0);
        }
      });
    }
    schedule();
  };

  window.requestAnimationFrame = (callback) => {
    const requestId = nextRequestId++;
    pending.set(requestId, callback);
    schedule();
    return requestId;
  };
  window.cancelAnimationFrame = (requestId) => {
    pending.delete(requestId);
  };
  window.setInterval = (callback, delay = 0, ...args) => {
    const currentCap = Math.max(1, Number(window.__VIBECODING_MAX_FPS__) || requestedCap);
    return nativeSetInterval(callback, Math.max(Number(delay) || 0, 1000 / currentCap), ...args);
  };
})();
</script>`;
}

function thumbnailStyleGuard() {
  return `<style data-vibecoding-thumbnail-performance>
*, *::before, *::after {
  animation-play-state: paused !important;
  transition-duration: 0s !important;
  scroll-behavior: auto !important;
}
</style>`;
}

export function ensureStandalonePerformanceGuard(html: string) {
  if (!html.trim() || html.includes(STANDALONE_MARKER)) return html;
  return insertAtDocumentStart(
    html,
    animationFrameGuard(
      INTERACTIVE_PREVIEW_FPS,
      STANDALONE_APP_MAX_DPR,
      STANDALONE_MARKER,
    ),
  );
}

export function applyPreviewPerformanceGuard(
  html: string,
  mode: PreviewPerformanceMode,
) {
  if (!html.trim()) return html;
  const marker = `data-vibecoding-performance-guard="preview-${mode}"`;
  if (html.includes(marker)) return html;
  const maxFps = mode === 'thumbnail' ? THUMBNAIL_PREVIEW_FPS : INTERACTIVE_PREVIEW_FPS;
  const additions = [
    animationFrameGuard(maxFps, PLATFORM_PREVIEW_MAX_DPR, marker),
    mode === 'thumbnail' ? thumbnailStyleGuard() : '',
  ].filter(Boolean).join('\n');
  return insertAtDocumentStart(html, additions);
}
