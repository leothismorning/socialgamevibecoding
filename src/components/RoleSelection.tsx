import React from 'react';
import styles from './RoleSelection.module.css';
import { usePointerTilt } from '../hooks/usePointerTilt';

export type SelectedRole = 'host' | 'participant' | null;

type RoleDefinition = {
  id: Exclude<SelectedRole, null>;
  title: string;
  description: string;
  keywords: string[];
};

const roles: RoleDefinition[] = [
  {
    id: 'host',
    title: 'HOST',
    description: 'Create, guide and lead.',
    keywords: ['guide', 'create', 'lead', 'orchestrate'],
  },
  {
    id: 'participant',
    title: 'PARTICIPANT',
    description: 'Join, explore and collaborate.',
    keywords: ['join', 'explore', 'collaborate', 'contribute'],
  },
];

export function RoleSelection({
  onCommit,
  onSelectedRoleChange,
}: {
  onCommit: (role: Exclude<SelectedRole, null>) => void;
  onSelectedRoleChange?: (role: SelectedRole) => void;
}) {
  const [selectedRole, setSelectedRole] = React.useState<SelectedRole>(null);
  const commitTimer = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);
  }, []);

  const selectRole = (role: Exclude<SelectedRole, null>) => {
    if (selectedRole === role) return;
    if (commitTimer.current !== null) window.clearTimeout(commitTimer.current);

    setSelectedRole(role);
    onSelectedRoleChange?.(role);

    commitTimer.current = window.setTimeout(() => {
      onCommit(role);
    }, 1200);
  };

  return (
    <section className={styles.section} aria-labelledby="role-selection-title">
      <header className={styles.header}>
        <p className={styles.eyebrow}>VIBECODING STUDY</p>
        <h1 id="role-selection-title">CHOOSE YOUR ROLE</h1>
        <p>Pick how you want to shape the experience.</p>
      </header>

      <div className={styles.roleGrid} role="radiogroup" aria-label="Choose your role">
        {roles.map((role, index) => (
          <RoleCard
            key={role.id}
            role={role}
            index={index}
            selected={selectedRole === role.id}
            dimmed={selectedRole !== null && selectedRole !== role.id}
            onSelect={() => selectRole(role.id)}
          />
        ))}
      </div>

      <p className={styles.selectionStatus} aria-live="polite">
        {selectedRole ? `${selectedRole.toUpperCase()} selected` : 'Select a role to continue'}
      </p>
    </section>
  );
}

function RoleCard({
  role,
  index,
  selected,
  dimmed,
  onSelect,
}: {
  key?: React.Key;
  role: RoleDefinition;
  index: number;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  const tilt = usePointerTilt<HTMLButtonElement>({ strength: 'hero', disabled: selected });

  return (
    <button
      ref={tilt.ref}
      type="button"
      role="radio"
      aria-label={`Choose ${role.title.toLowerCase()} role. ${role.description}`}
      aria-checked={selected}
      aria-pressed={selected}
      className={`${styles.cardButton} ${selected ? styles.selected : ''} ${dimmed ? styles.dimmed : ''}`}
      style={{ '--entry-delay': `${index * 80}ms` } as React.CSSProperties}
      onClick={onSelect}
      onPointerMove={tilt.onPointerMove}
      onPointerEnter={tilt.onPointerEnter}
      onPointerLeave={tilt.onPointerLeave}
      onPointerCancel={tilt.onPointerCancel}
    >
      <span className={styles.orbit} aria-hidden="true" />
      <FlipTrail role={role.id} />

      <span className={styles.cardScene}>
        <span className={styles.faceFront}>
          <span className={styles.cursorGlow} aria-hidden="true" />
          <PersonIcon role={role.id} variant="fill" />
          <span className={styles.cardCopy}>
            <strong>{role.title}</strong>
            <span>{role.description}</span>
          </span>
        </span>

        <span className={styles.faceBack}>
          <PersonIcon role={role.id} variant="outline" />
          <span className={`${styles.backKeywords} ${role.id === 'participant' ? styles.participantKeywords : styles.hostKeywords}`}>
            <strong className={role.id === 'participant' ? styles.participantTitle : styles.hostTitle}>{role.title}</strong>
            {role.keywords.map((keyword) => <span key={keyword}>{keyword}</span>)}
          </span>
        </span>
      </span>
    </button>
  );
}

function FlipTrail({ role }: { role: Exclude<SelectedRole, null> }) {
  return (
    <span className={styles.trails} aria-hidden="true">
      <span className={`${styles.trail} ${styles.trailOne}`} data-role={role} />
      <span className={`${styles.trail} ${styles.trailTwo}`} data-role={role} />
      <span className={`${styles.trail} ${styles.trailThree}`} data-role={role} />
    </span>
  );
}

function PersonIcon({
  role,
  variant,
}: {
  role: Exclude<SelectedRole, null>;
  variant: 'fill' | 'outline';
}) {
  const gradientId = `person-gradient-${role}`;
  const silhouettePath = 'M100 6C84 6 72 19 72 35C72 45 77 54 85 59C58 65 42 84 42 110V158C42 175 55 188 72 188H128C145 188 158 175 158 158V110C158 84 142 65 115 59C123 54 128 45 128 35C128 19 116 6 100 6Z';

  if (variant === 'fill') {
    return (
      <svg className={styles.personFill} viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="20" y1="20" x2="176" y2="188" gradientUnits="userSpaceOnUse">
            {role === 'host' ? (
              <>
                <stop stopColor="#CBEFF0" />
                <stop offset=".48" stopColor="#95CDB6" />
                <stop offset="1" stopColor="#0FA958" />
              </>
            ) : (
              <>
                <stop stopColor="#FFFFFF" />
                <stop offset=".42" stopColor="#C7F8FB" />
                <stop offset="1" stopColor="#95CDB6" />
              </>
            )}
          </linearGradient>
        </defs>
        <path d={silhouettePath} fill={`url(#${gradientId})`} />
      </svg>
    );
  }

  return (
    <svg className={styles.personOutline} viewBox="0 0 200 200" aria-hidden="true">
      <path d={silhouettePath} fill="none" stroke="#000000" strokeWidth="3.5" strokeLinejoin="round" />
    </svg>
  );
}
