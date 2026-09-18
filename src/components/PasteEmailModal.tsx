'use client';

import React, { useState } from 'react';

interface PasteEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitEmail: (emailText: string) => void;
}

export const PasteEmailModal: React.FC<PasteEmailModalProps> = ({
  isOpen,
  onClose,
  onSubmitEmail,
}) => {
  const [emailText, setEmailText] = useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailText.trim()) return;
    onSubmitEmail(emailText.trim());
    setEmailText('');
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Paste Email (Milestone M1)</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <p className="modal-description">
          Zero-OAuth inbox triage. Paste the email content below. OMI will summarize the thread, identify asks, and draft a response for your review. (Tagged as untrusted external content per §7).
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <textarea
            className="paste-textarea"
            placeholder="From: alex@partner.com&#10;Subject: Q3 Roadmap Sync&#10;&#10;Hi, Could you share the updated API specs by Friday?..."
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            rows={8}
            required
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              className="cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="action-btn">
              Triage & Draft Reply
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
