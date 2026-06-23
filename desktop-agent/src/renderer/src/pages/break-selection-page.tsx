import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { attendanceService } from '../services/api/attendance.service';

const breakTypes = ['Lunch Break', 'Tea Break', 'Short Break', 'Custom Break'];

export function BreakSelectionPage() {
  const navigate = useNavigate();
  const [breakType, setBreakType] = useState(breakTypes[0]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await attendanceService.breakStart(breakType, comment.trim());
      navigate('/break-active', { replace: true, state: { breakType } });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start break');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="compact-page">
      <div className="section-heading">
        <p className="eyebrow">Break</p>
        <h2>Select break type</h2>
      </div>
      <form className="break-form" onSubmit={submit}>
        <div className="radio-list">
          {breakTypes.map((type) => (
            <label className="radio-row" key={type}>
              <input
                type="radio"
                name="breakType"
                value={type}
                checked={breakType === type}
                onChange={() => setBreakType(type)}
              />
              <span>{type}</span>
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
        <button className="action-button action-blue" disabled={submitting}>
          {submitting ? 'Starting...' : 'Start Break'}
        </button>
        <Link className="text-link" to="/">
          Cancel
        </Link>
      </form>
    </section>
  );
}
