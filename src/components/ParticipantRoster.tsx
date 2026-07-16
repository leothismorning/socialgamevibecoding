import type { StudyParticipant } from '../types';
import { cn } from '../lib/utils';

export function ParticipantAvatar({ joined = true, className = '' }: { joined?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 60 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M30 5C23.37 5 18 10.37 18 17c0 4.08 2.04 7.69 5.16 9.86C14.91 29.68 9 37.5 9 46.7V55c0 2.21 1.79 4 4 4h34c2.21 0 4-1.79 4-4v-8.3c0-9.2-5.91-17.02-14.16-19.84A11.98 11.98 0 0 0 42 17C42 10.37 36.63 5 30 5Z"
        fill={joined ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={joined ? 0 : 2.25}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ParticipantRoster({
  participants,
  capacity = 21,
  compact = false,
}: {
  participants: StudyParticipant[];
  capacity?: number;
  compact?: boolean;
}) {
  const joinedByCode = new Map(
    participants.filter((participant) => participant.joined_at).map((participant) => [participant.code, participant]),
  );
  const seats = [
    { code: 'CREATOR', label: 'Creator', joined: true },
    ...Array.from({ length: capacity - 1 }, (_, index) => {
      const code = `P${String(index + 1).padStart(2, '0')}`;
      const participant = joinedByCode.get(code);
      return { code, label: participant?.name || code, joined: Boolean(participant) };
    }),
  ];
  const occupancy = joinedByCode.size + 1;

  return (
    <section className={cn('participant-roster', compact && 'is-compact')} aria-labelledby="participant-roster-title">
      <div className="participant-roster-heading">
        <div>
          <p className="participant-roster-kicker">ROOM</p>
          <h2 id="participant-roster-title">Joined participants</h2>
        </div>
        <div className="participant-roster-readiness is-ready">
          <strong>{occupancy}/{capacity}</strong>
          <span>Creator can start anytime</span>
        </div>
      </div>
      <div className="participant-seat-grid" role="list" aria-label={`${occupancy} of ${capacity} seats occupied`}>
        {seats.map((seat) => (
          <div
            className={cn('participant-seat', seat.joined ? 'is-joined' : 'is-empty', seat.code === 'CREATOR' && 'is-creator')}
            key={seat.code}
            role="listitem"
          >
            <span className="participant-seat-avatar">
              <ParticipantAvatar joined={seat.joined} />
            </span>
            <span className="participant-seat-copy">
              <strong>{seat.code}</strong>
              <small>{seat.joined ? seat.label : '虚位以待'}</small>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
