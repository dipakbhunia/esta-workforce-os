import { ArrowLeft, Coffee } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { attendanceService } from '../services/api/attendance.service';
import { breakPolicyService } from '../services/api/break-policy.service';
import type { BreakPolicy } from '../types/api';

const iconProps = { size: 18, strokeWidth: 2.2, 'aria-hidden': true } as const;

export function BreakSelectionPage() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState<BreakPolicy[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState('');
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await breakPolicyService.listActive();
        setPolicies(data);
        setSelectedPolicyId(data[0]?.id ?? '');
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'Unable to load break policies');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const selected = policies.find((policy) => policy.id === selectedPolicyId);
      if (!selected) throw new Error('Select a break policy');
      await attendanceService.breakStart(selected.id, comment.trim());
      navigate('/break-active', { replace: true, state: { breakPolicy: selected } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start break');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="compact-page break-selection-page">
      <div className="section-heading">
        <p className="eyebrow">Break</p>
        <h2>Select break type</h2>
      </div>
      <form className="break-form" onSubmit={submit}>
        <div className="radio-list">
          {loading && <p className="status-message">Loading break policies...</p>}
          {!loading && policies.length === 0 && (
            <p className="error">No active break policies configured.</p>
          )}
          {policies.map((policy) => (
            <label className="radio-row" key={policy.id}>
              <input
                type="radio"
                name="breakPolicyId"
                value={policy.id}
                checked={selectedPolicyId === policy.id}
                onChange={() => setSelectedPolicyId(policy.id)}
              />
              <span>
                {policy.name}
                <small>{policy.allowedMinutes} min allowed</small>
              </span>
            </label>
          ))}
        </div>
        <label className="field">
          Comment optional
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Add a quick note"
            maxLength={160}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button
          className="action-button action-blue"
          disabled={submitting || loading || policies.length === 0}
        >
          <span className="button-content">
            <Coffee size={20} strokeWidth={2.2} aria-hidden="true" />
            {submitting ? 'Starting...' : 'Start Break'}
          </span>
        </button>
        <button className="text-link" type="button" onClick={() => navigate('/')}>
          <span className="link-button-content">
            <ArrowLeft {...iconProps} />
            Go Back
          </span>
        </button>
      </form>
    </section>
  );
}
