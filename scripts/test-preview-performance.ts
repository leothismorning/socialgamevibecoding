import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  applyPreviewPerformanceGuard,
  ensureStandalonePerformanceGuard,
} from '../server/previewPerformance.js';

const baseHtml = '<!doctype html><html><head><title>Performance test</title></head><body></body></html>';

function guardScripts(html: string) {
  return [...html.matchAll(/<script\s+data-vibecoding-performance-guard="[^"]+">([\s\S]*?)<\/script>/gi)]
    .map((match) => match[1]);
}

function runtimeFor(html: string) {
  let nextNativeId = 1;
  let nativeCallbacks = new Map<number, (timestamp: number) => void>();
  const intervalDelays: number[] = [];
  const document = { hidden: false };
  const window: Record<string, any> = {
    requestAnimationFrame(callback: (timestamp: number) => void) {
      const id = nextNativeId++;
      nativeCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame(id: number) {
      nativeCallbacks.delete(id);
    },
    setInterval(_callback: () => void, delay: number) {
      intervalDelays.push(delay);
      return intervalDelays.length;
    },
    setTimeout(callback: () => void) {
      callback();
      return 0;
    },
  };
  const context = vm.createContext({
    window,
    document,
    intervalDelays,
    Map,
    Number,
    Math,
    Array,
  });
  guardScripts(html).forEach((script) => vm.runInContext(script, context));

  return {
    window,
    document,
    intervalDelays,
    pump(timestamp: number) {
      const callbacks = [...nativeCallbacks.values()];
      nativeCallbacks = new Map();
      callbacks.forEach((callback) => callback(timestamp));
    },
  };
}

function runContinuousAnimation(html: string, durationMs = 1000) {
  const runtime = runtimeFor(html);
  let calls = 0;
  const animate = () => {
    calls += 1;
    runtime.window.requestAnimationFrame(animate);
  };
  runtime.window.requestAnimationFrame(animate);
  for (let timestamp = 0; timestamp <= durationMs; timestamp += 1000 / 60) {
    runtime.pump(timestamp);
  }
  return { calls, runtime };
}

const standalone = ensureStandalonePerformanceGuard(baseHtml);
assert.equal(guardScripts(standalone).length, 1);
assert.equal(ensureStandalonePerformanceGuard(standalone), standalone);
assert.ok(standalone.indexOf('data-vibecoding-performance-guard') < standalone.indexOf('<title>'));

const interactive = applyPreviewPerformanceGuard(baseHtml, 'interactive');
const interactiveRun = runContinuousAnimation(interactive);
assert.ok(interactiveRun.calls >= 29 && interactiveRun.calls <= 31, `Expected about 30 FPS, got ${interactiveRun.calls}`);
interactiveRun.runtime.window.setInterval(() => undefined, 0);
assert.ok(interactiveRun.runtime.intervalDelays[0] >= 1000 / 30);

const thumbnail = applyPreviewPerformanceGuard(standalone, 'thumbnail');
assert.match(thumbnail, /data-vibecoding-thumbnail-performance/);
assert.match(thumbnail, /animation-play-state:\s*paused/);
const thumbnailRun = runContinuousAnimation(thumbnail);
assert.ok(thumbnailRun.calls >= 5 && thumbnailRun.calls <= 6, `Expected about 5 FPS, got ${thumbnailRun.calls}`);
thumbnailRun.runtime.window.setInterval(() => undefined, 0);
assert.ok(thumbnailRun.runtime.intervalDelays[0] >= 200);

const hiddenRuntime = runtimeFor(interactive);
let hiddenCalls = 0;
hiddenRuntime.document.hidden = true;
hiddenRuntime.window.requestAnimationFrame(() => { hiddenCalls += 1; });
hiddenRuntime.pump(0);
hiddenRuntime.pump(100);
assert.equal(hiddenCalls, 0);
hiddenRuntime.document.hidden = false;
hiddenRuntime.pump(200);
assert.equal(hiddenCalls, 1);

const cancelRuntime = runtimeFor(interactive);
let cancelledCalls = 0;
const cancelledId = cancelRuntime.window.requestAnimationFrame(() => { cancelledCalls += 1; });
cancelRuntime.window.cancelAnimationFrame(cancelledId);
cancelRuntime.pump(0);
assert.equal(cancelledCalls, 0);

console.log('Preview performance guards passed: standalone 30 FPS, interactive 30 FPS, thumbnail 5 FPS, timer clamping, hidden pause, and cancellation');
