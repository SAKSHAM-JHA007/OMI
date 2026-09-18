'use client';

import React, { useEffect, useState } from 'react';

interface SettingsMemoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsMemoryModal: React.FC<SettingsMemoryModalProps> = ({ isOpen, onClose }) => {
  const [facts, setFacts] = useState<Array<{ id: string; text: string; created_at: string }>>([]);
  const [loading, setLoading] = useState(false);

  const loadFacts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/memory');
      const data = await res.json();
      setFacts(data.facts || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadFacts();
    }
  }, [isOpen]);

  const handleDelete = async (id: string) => {
    await fetch(`/api/memory?id=${id}`, { method: 'DELETE' });
    setFacts((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDeleteAll = async () => {
    if (!confirm('Delete all stored memory facts?')) return;
    await fetch('/api/memory?id=all', { method: 'DELETE' });
    setFacts([]);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Memory Facts (PRD §9)</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        <p className="modal-description">
          User-authored facts stored verbatim and injected into system prompts (maximum 30 facts). No automatic extraction.
        </p>

        <div className="memory-meta-row">
          <span className="memory-counter">Stored facts: {facts.length} / 30</span>
          {facts.length > 0 && (
            <button
              type="button"
              className="memory-delete-all-btn"
              onClick={handleDeleteAll}
            >
              Delete all facts
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ color: '#8892a0', textAlign: 'center', padding: '24px', fontSize: '13.5px' }}>Loading memory...</div>
        ) : facts.length === 0 ? (
          <div style={{ color: '#687280', textAlign: 'center', padding: '32px', fontSize: '13.5px', textWrap: 'pretty' }}>
            No facts stored yet. Tell OMI &ldquo;Remember that...&rdquo; to store preferences.
          </div>
        ) : (
          <div className="memory-list">
            {facts.map((f) => (
              <div key={f.id} className="memory-item">
                <span className="memory-item-text">{f.text}</span>
                <button
                  type="button"
                  className="memory-delete-btn"
                  onClick={() => handleDelete(f.id)}
                  title="Delete fact"
                  aria-label={`Delete fact: ${f.text}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
