import React from 'react';
import { ArrowRight, GitBranch, Upload } from 'lucide-react';
import type { StudyState } from '../types';
import { CursorSafeIframe } from './CursorSafeIframe';

export function VersionEvolution({ state }: { state: StudyState }) {
  const versions = state.versions;
  const currentVersionId = state.experiment?.current_version_id ?? versions.at(-1)?.id;

  return (
    <div className="version-evolution-stage">
      <div className="version-origin" aria-label="Experiment starting point">
        <span className="version-origin-dot" aria-hidden="true" />
        <div>
          <span className="version-kicker">Starting point</span>
          <strong>Experiment begins</strong>
        </div>
      </div>

      <ol
        className="version-evolution-track"
        aria-label={`${versions.length} project versions`}
        style={{ '--version-count': versions.length } as React.CSSProperties}
      >
        {versions.map((version, index) => {
          const sources = state.versionSources.filter((source) => source.version_id === version.id);
          const legacySource = version.source_comment_id
            ? state.comments.find((comment) => comment.id === version.source_comment_id)
            : null;
          const isCurrent = version.id === currentVersionId;
          const creationLabel = index === 0 ? 'Initial creator upload' : 'Created from selected ideas';

          return (
            <li
              key={version.id}
              className="version-evolution-step"
              style={{ '--version-index': index } as React.CSSProperties}
            >
              <span className="version-connector" aria-hidden="true" />
              <span className="version-node" aria-hidden="true">{index + 1}</span>
              <article
                className={`version-evolution-card ${isCurrent ? 'is-current' : ''}`}
                data-spotlight-surface
              >
                <header>
                  <div>
                    <span className="version-kicker">Version {index + 1}</span>
                    <h4>{version.title}</h4>
                  </div>
                  <span className={`version-status ${isCurrent ? 'is-current' : ''}`}>
                    {isCurrent ? 'Current version' : 'Previous version'}
                  </span>
                </header>

                <div className="version-preview-thumbnail" aria-label={`Preview of ${version.title}`}>
                  <CursorSafeIframe
                    title={`${version.title} thumbnail`}
                    srcDoc={version.code}
                    className="version-preview-iframe"
                  />
                  <span>{isCurrent ? 'CURRENT PATH' : `ROUND ${version.round_number}`}</span>
                </div>

                <div className="version-meta-grid">
                  <span><GitBranch aria-hidden="true" /> Round {version.round_number}</span>
                  <span><Upload aria-hidden="true" /> {creationLabel}</span>
                </div>

                <div className="version-source-summary">
                  {sources.length > 0 ? (
                    <>
                      <strong>{sources.length} selected ideas shaped this version</strong>
                      <p>{sources.map((source) => `#${source.selection_rank} ${source.content}`).join(' · ')}</p>
                    </>
                  ) : legacySource ? (
                    <>
                      <strong>Built from {legacySource.participant_code}</strong>
                      <p>{legacySource.content}</p>
                    </>
                  ) : (
                    <>
                      <strong>Initial foundation</strong>
                      <p>The creator uploaded the first working project version.</p>
                    </>
                  )}
                </div>
              </article>
            </li>
          );
        })}

        <li className="version-future-step" aria-label="Future versions will continue along this path">
          <span className="version-future-line" aria-hidden="true" />
          <span className="version-future-node" aria-hidden="true" />
          <div>
            <span className="version-kicker">Next evolution</span>
            <strong>Future versions continue here</strong>
            <ArrowRight aria-hidden="true" />
          </div>
        </li>
      </ol>
    </div>
  );
}
