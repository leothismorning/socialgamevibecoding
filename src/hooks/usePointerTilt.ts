import React from 'react';

export type PointerTiltStrength = 'hero' | 'surface' | 'bet' | 'magnetic';

const strengthMap: Record<PointerTiltStrength, { rotate: number; lift: number; scale: number }> = {
  hero: { rotate: 6, lift: 6, scale: 1.015 },
  surface: { rotate: 3, lift: 3, scale: 1.008 },
  bet: { rotate: 2.5, lift: 3, scale: 1.008 },
  magnetic: { rotate: .8, lift: 3, scale: 1.02 },
};

export function usePointerTilt<T extends HTMLElement>({
  strength = 'surface',
  disabled = false,
}: {
  strength?: PointerTiltStrength;
  disabled?: boolean;
} = {}) {
  const ref = React.useRef<T>(null);
  const frame = React.useRef<number | null>(null);
  const target = React.useRef({ x: 0, y: 0, glowX: 50, glowY: 50 });
  const current = React.useRef({ x: 0, y: 0, glowX: 50, glowY: 50 });
  const config = strengthMap[strength];

  const renderFrame = React.useCallback(() => {
    const node = ref.current;
    if (!node) return;

    const next = current.current;
    const goal = target.current;
    next.x += (goal.x - next.x) * .14;
    next.y += (goal.y - next.y) * .14;
    next.glowX += (goal.glowX - next.glowX) * .16;
    next.glowY += (goal.glowY - next.glowY) * .16;

    node.style.setProperty('--tilt-x', `${next.x.toFixed(3)}deg`);
    node.style.setProperty('--tilt-y', `${next.y.toFixed(3)}deg`);
    node.style.setProperty('--glow-x', `${next.glowX.toFixed(2)}%`);
    node.style.setProperty('--glow-y', `${next.glowY.toFixed(2)}%`);
    node.style.setProperty('--tilt-lift', `${config.lift}px`);
    node.style.setProperty('--tilt-scale', `${config.scale}`);

    const moving = Math.abs(goal.x - next.x) > .02 || Math.abs(goal.y - next.y) > .02 ||
      Math.abs(goal.glowX - next.glowX) > .1 || Math.abs(goal.glowY - next.glowY) > .1;
    frame.current = moving ? window.requestAnimationFrame(renderFrame) : null;
  }, [config.lift, config.scale]);

  const scheduleFrame = React.useCallback(() => {
    if (frame.current === null) frame.current = window.requestAnimationFrame(renderFrame);
  }, [renderFrame]);

  const reset = React.useCallback(() => {
    target.current = { x: 0, y: 0, glowX: 50, glowY: 50 };
    scheduleFrame();
  }, [scheduleFrame]);

  React.useEffect(() => () => {
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
  }, []);

  React.useEffect(() => {
    if (disabled) reset();
  }, [disabled, reset]);

  const onPointerMove = React.useCallback((event: React.PointerEvent<T>) => {
    if (disabled || event.pointerType === 'touch') return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    target.current = {
      x: (y - .5) * -config.rotate * 2,
      y: (x - .5) * config.rotate * 2,
      glowX: x * 100,
      glowY: y * 100,
    };
    scheduleFrame();
  }, [config.rotate, disabled, scheduleFrame]);

  return {
    ref,
    onPointerMove,
    onPointerEnter: scheduleFrame,
    onPointerLeave: reset,
    onPointerCancel: reset,
  };
}
