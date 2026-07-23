import {Sparkles} from 'lucide-react';
import {useId} from 'react';

import './WinnerPresentation.css';

interface TrophyIconProps {
  className?: string;
}

interface WinnerPresentationProps {
  winnerName: string;
  subtitle?: string;
}

export function TrophyIcon({className}: TrophyIconProps) {
  const gradientId = useId().replace(/:/g, '');

  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="23" y1="17" x2="99" y2="102" gradientUnits="userSpaceOnUse">
          <stop stopColor="#C7F8FB" />
          <stop offset="0.52" stopColor="#95CDB6" />
          <stop offset="1" stopColor="#0FA958" />
        </linearGradient>
      </defs>
      <path d="M35 23H85V43C85 59 74 72 60 72C46 72 35 59 35 43V23Z" fill={`url(#${gradientId})`} />
      <path d="M35 31H22V40C22 52 30 60 42 61" stroke={`url(#${gradientId})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M85 31H98V40C98 52 90 60 78 61" stroke={`url(#${gradientId})`} strokeWidth="8" strokeLinecap="round" />
      <path d="M60 72V91M43 99H77" stroke={`url(#${gradientId})`} strokeWidth="9" strokeLinecap="round" />
      <path d="M47 91H73" stroke="#2E563B" strokeOpacity="0.42" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function WinnerPresentation({winnerName, subtitle = '本轮胜出'}: WinnerPresentationProps) {
  return (
    <section className="winner-presentation" aria-live="polite" aria-label={`${winnerName} ${subtitle}`}>
      <div className="winner-presentation__particles" aria-hidden="true">
        {Array.from({length: 12}, (_, index) => <Sparkles key={index} />)}
      </div>
      <span className="winner-presentation__wave" aria-hidden="true" />
      <TrophyIcon className="winner-presentation__trophy" />
      <small>{subtitle}</small>
      <strong>{winnerName}</strong>
    </section>
  );
}
