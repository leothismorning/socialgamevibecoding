import React from 'react';

export function InteractiveSurface({
  children,
  className = '',
  disabled = false,
  onAnimationEnd,
}: {
  key?: React.Key;
  children: React.ReactNode;
  className?: string;
  strength?: 'hero' | 'surface' | 'bet' | 'magnetic';
  disabled?: boolean;
  onAnimationEnd?: React.AnimationEventHandler<HTMLDivElement>;
}) {
  return (
    <div
      className={`interactive-surface ${disabled ? 'interactive-surface-disabled' : ''} ${className}`}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="interactive-surface-content">{children}</div>
    </div>
  );
}
