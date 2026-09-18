'use client';

import React, { useState } from 'react';
import { Citation } from '@/lib/agent/types';

interface ToolCallItem {
  id: string;
  seq: number;
  name: string;
  args: any;
  resultSummary?: string;
  trust?: 'trusted' | 'untrusted';
  ok?: boolean;
  expanded?: boolean;
}

interface AgentRunStreamProps {
  statusMessage: string;
  isRunning: boolean;
  isTainted: boolean;
  elapsedSeconds: number;
  toolCalls: ToolCallItem[];
  assistantText: string;
  citations: Citation[];
  onCancel: () => void;
  onToggleToolExpand: (id: string) => void;
}

export const AgentRunStream: React.FC<AgentRunStreamProps> = ({
  statusMessage,
  isRunning,
  isTainted,
  elapsedSeconds,
  toolCalls,
  assistantText,
  citations,
  onCancel,
  onToggleToolExpand,
}) => {
  const [showThinking, setShowThinking] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!assistantText) return;
    navigator.clipboard.writeText(assistantText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Render text with clickable citation badges
  const renderFormattedText = (text: string) => {
    const parts = text.split(/(\[Sourced:\s*[^\]]+\]|\[Inferred\]|\[Unverified\])/gi);

    return parts.map((part, idx) => {
      const sourcedMatch = part.match(/\[Sourced:\s*([^\]]+)\]/i);
      if (sourcedMatch) {
        const url = sourcedMatch[1].trim();
        let displayDomain = url;
        try {
          displayDomain = new URL(url).hostname.replace(/^www\./, '');
        } catch {}
        return (
          <a
            key={idx}
            href={url}
            target="_blank"
            rel="noreferrer noopener"
            className="claude-citation-chip"
            title={`Source: ${url}`}
          >
            ↗ {displayDomain}
          </a>
        );
      }

      if (/\[Inferred\]/i.test(part)) {
        return (
          <span key={idx} className="claude-citation-chip inferred" title="Synthesized by OMI">
            ✦ Inferred
          </span>
        );
      }

      if (/\[Unverified\]/i.test(part)) {
        return (
          <span key={idx} className="claude-citation-chip unverified" title="Uncorroborated source">
            ⚠ Unverified
          </span>
        );
      }

      return <span key={idx}>{part}</span>;
    });
  };

  const hasTools = toolCalls.length > 0;
  const isWorking = isRunning && !assistantText;

  return (
    <div className="claude-stream-wrapper">
      {/* Claude-style collapsible thinking & tool execution pill */}
      {(hasTools || isRunning) && (
        <div className="claude-thought-section">
          <button
            type="button"
            className={`claude-thought-toggle ${isRunning ? 'pulsing' : ''}`}
            onClick={() => setShowThinking(!showThinking)}
            aria-expanded={showThinking}
          >
            <span className="thought-icon">✦</span>
            <span className="thought-label">
              {isRunning
                ? statusMessage || `Thinking...`
                : hasTools
                ? `Thought for ${elapsedSeconds}s (${toolCalls.length} step${toolCalls.length === 1 ? '' : 's'})`
                : `Thought for ${elapsedSeconds || 1}s`}
            </span>
            <span className={`thought-chevron ${showThinking ? 'open' : ''}`}>▾</span>

            {isTainted && (
              <span className="claude-taint-tag" title="External untrusted content ingested">
                🛡 Tainted
              </span>
            )}

            {isRunning && (
              <button
                type="button"
                className="claude-stop-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onCancel();
                }}
                aria-label="Stop current run"
              >
                Stop
              </button>
            )}
          </button>

          {/* Collapsible Steps Drawer */}
          {showThinking && (
            <div className="claude-thought-content">
              {toolCalls.length === 0 && (
                <div className="thought-step muted">Direct synthesis from model context.</div>
              )}
              {toolCalls.map((tc) => (
                <div key={tc.id} className="thought-tool-card">
                  <div
                    className="tool-card-head"
                    onClick={() => onToggleToolExpand(tc.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onToggleToolExpand(tc.id);
                      }
                    }}
                    aria-expanded={tc.expanded}
                  >
                    <span className="tool-name">⚙ {tc.name}</span>
                    <span className="tool-summary">{tc.resultSummary || 'Running...'}</span>
                    <span className="tool-arrow">{tc.expanded ? '▴' : '▾'}</span>
                  </div>
                  {tc.expanded && (
                    <div className="tool-card-body">
                      <div className="code-label">Arguments:</div>
                      <pre>{JSON.stringify(tc.args, null, 2)}</pre>
                      {tc.resultSummary && (
                        <>
                          <div className="code-label" style={{ marginTop: '8px' }}>Result:</div>
                          <pre>{tc.resultSummary}</pre>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Claude-style Clean Flowing Response Text */}
      <div className="claude-response-body">
        {assistantText ? (
          <div className="claude-markdown">
            {renderFormattedText(assistantText)}
            {isRunning && <span className="claude-cursor" />}
          </div>
        ) : isWorking ? (
          <div className="claude-shimmer-placeholder">
            <span className="shimmer-dot" />
            <span className="shimmer-dot" />
            <span className="shimmer-dot" />
          </div>
        ) : null}
      </div>

      {/* Subtle Bottom Action Bar */}
      {assistantText && !isRunning && (
        <div className="claude-actions-bar">
          <button
            type="button"
            className="claude-action-icon"
            onClick={handleCopy}
            title="Copy response"
            aria-label="Copy response text"
          >
            {copied ? '✓ Copied' : '⧉ Copy'}
          </button>
          <span className="claude-time-stat">{elapsedSeconds}s</span>
        </div>
      )}
    </div>
  );
};
