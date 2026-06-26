import type { JSX } from "react";
import type { PartSummary } from "../../shared/types.js";

type PartsDashboardProps = {
  parts: PartSummary[];
  loading: boolean;
  error: string | null;
  onProgramStatusClick?: (partId: string, programId: string) => void;
};

export function PartsDashboard({
  parts,
  loading,
  error,
  onProgramStatusClick,
}: PartsDashboardProps): JSX.Element {
  return (
    <section className="dashboard" aria-labelledby="dashboard-heading">
      {loading ? <p className="muted dashboard-loading">Refreshing...</p> : null}
      {error ? <p className="error">{error}</p> : null}
      {parts.length === 0 ? (
        <p className="empty-state">
          Upload a STEP file to start processing parts.
        </p>
      ) : null}

      <div className="part-list">
        {parts.map((part) => (
          <article className="part-group" key={part.id}>
            <div className="part-row">
              <div className="name-cell">
                <strong>{part.name}</strong>
                <small>{part.id}</small>
              </div>
              <StatusBadge status={part.localLifecycle} />
              <AggregateMetric
                label="Setups"
                values={part.rows.map((row) => row.setupCount)}
                formatValue={formatNumber}
              />
              <AggregateMetric
                label="Duration"
                values={part.rows.map((row) => row.totalDurationSeconds)}
                formatValue={formatDuration}
              />
              <ScoreAggregate values={part.rows.map((row) => row.score)} />
            </div>

            <div className="program-rows">
              {part.rows.map((row) => (
                <div
                  className="program-row"
                  key={`${part.id}-${row.cutConfigId}`}
                >
                  <div className="name-cell">
                    {row.programUrl ? (
                      <a
                        className="program-link"
                        href={row.programUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <strong>{row.cutConfigName}</strong>
                        <small>{row.programId ?? "Waiting for program"}</small>
                      </a>
                    ) : (
                      <>
                        <strong>{row.cutConfigName}</strong>
                        <small>{row.programId ?? "Waiting for program"}</small>
                      </>
                    )}
                  </div>
                  <StatusBadge
                    status={row.status}
                    partId={part.id}
                    programId={row.programId}
                    onProgramStatusClick={onProgramStatusClick}
                  />
                  <MetricValue
                    label="Setups"
                    value={
                      row.setupCount === null ? "--" : String(row.setupCount)
                    }
                  />
                  <MetricValue
                    label="Duration"
                    value={formatDuration(row.totalDurationSeconds)}
                  />
                  <ScoreValue label="Score" score={row.score} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MetricValue({
  label,
  value,
}: {
  label: string;
  value: string;
}): JSX.Element {
  return (
    <div className="metric-value">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function AggregateMetric({
  label,
  values,
  formatValue,
}: {
  label: string;
  values: Array<number | null>;
  formatValue: (value: number | null) => string;
}): JSX.Element {
  const numericValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (numericValues.length === 0) {
    return <MetricValue label={label} value="-- / -- / --" />;
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const avg =
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;

  return (
    <MetricValue
      label={label}
      value={`${formatValue(min)} / ${formatValue(max)} / ${formatValue(avg)}`}
    />
  );
}

function ScoreAggregate({
  values,
}: {
  values: Array<number | null>;
}): JSX.Element {
  const numericValues = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (numericValues.length === 0) {
    return <MetricValue label="Score" value="-- / -- / --" />;
  }

  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const avg =
    numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;

  return (
    <div className="score-value">
      <span>Score</span>
      <strong className="score-parts">
        <ScoreText score={min} />
        <span> / </span>
        <ScoreText score={max} />
        <span> / </span>
        <ScoreText score={avg} />
      </strong>
    </div>
  );
}

function StatusBadge({
  status,
  partId,
  programId,
  onProgramStatusClick,
}: {
  status: string;
  partId?: string;
  programId?: string | null;
  onProgramStatusClick?: (partId: string, programId: string) => void;
}): JSX.Element {
  const className = `status-badge status-${status.toLowerCase()}`;

  if (partId && programId && onProgramStatusClick) {
    return (
      <button
        className={`${className} status-button`}
        type="button"
        onClick={() => onProgramStatusClick(partId, programId)}
        title="Fetch and log the latest Toolpath program response"
      >
        {status}
      </button>
    );
  }

  return <span className={className}>{status}</span>;
}

function ScoreValue({
  label,
  score,
}: {
  label: string;
  score: number | null;
}): JSX.Element {
  return (
    <div className="score-value">
      <span>{label}</span>
      <strong>
        <ScoreText score={score} />
      </strong>
    </div>
  );
}

function ScoreText({ score }: { score: number | null }): JSX.Element {
  if (score === null || !Number.isFinite(score)) {
    return <span>--</span>;
  }

  return <span className={getScoreClassName(score)}>{score.toFixed(1)}</span>;
}

function getScoreClassName(score: number): string {
  if (score === 100) {
    return "score-good";
  }

  if (score >= 75) {
    return "score-warn";
  }

  return "score-bad";
}

function formatNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) {
    return "--";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDuration(totalDurationSeconds: number | null): string {
  if (totalDurationSeconds === null || !Number.isFinite(totalDurationSeconds)) {
    return "--:--";
  }

  const roundedSeconds = Math.max(0, Math.round(totalDurationSeconds));
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
