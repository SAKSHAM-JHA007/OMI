'use client';

import React, { useState, useEffect, useRef } from 'react';
import { OrbCore, AgentVisualState } from '@/components/OrbCore';
import { AgentRunStream } from '@/components/AgentRunStream';
import { MenuPanel } from '@/components/MenuPanel';
import { PasteEmailModal } from '@/components/PasteEmailModal';
import { SettingsMemoryModal } from '@/components/SettingsMemoryModal';
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

export default function HomePage() {
  const [visualState, setVisualState] = useState<AgentVisualState>('idle');
  const [prompt, setPrompt] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isMemoryModalOpen, setIsMemoryModalOpen] = useState(false);

  // Run & Execution state
  const [conversationId, setConversationId] = useState<string>('');
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [isTainted, setIsTainted] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [toolCalls, setToolCalls] = useState<ToolCallItem[]>([]);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Dynamic greeting based on time of day
  const [greeting, setGreeting] = useState('Good evening.');
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning.');
    else if (hour < 17) setGreeting('Good afternoon.');
    else setGreeting('Good evening.');
  }, []);

  // Timer effect during active runs
  useEffect(() => {
    if (isRunning) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  // Connect to SSE stream
  const connectRunStream = (runId: string) => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    setIsRunning(true);
    setVisualState('thinking');

    const es = new EventSource(`/api/runs/${runId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'status':
            setStatusMessage(data.message);
            setVisualState('working');
            break;

          case 'token':
            setAssistantText((prev) => prev + data.delta);
            setVisualState('speaking');
            break;

          case 'tool_call':
            setVisualState('working');
            setToolCalls((prev) => [
              ...prev,
              {
                id: data.id,
                seq: data.seq,
                name: data.name,
                args: data.args,
                expanded: false,
              },
            ]);
            break;

          case 'tool_result':
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.id === data.id
                  ? {
                      ...tc,
                      resultSummary: data.summary,
                      trust: data.trust,
                      ok: data.ok,
                    }
                  : tc
              )
            );
            break;

          case 'tainted':
            setIsTainted(true);
            break;

          case 'citation':
            setCitations((prev) => [...prev, data.citation]);
            break;

          case 'done':
            if (data.text) {
              setAssistantText((prev) => (prev ? prev : data.text));
            }
            if (data.citations && data.citations.length > 0) {
              setCitations(data.citations);
            }
            setIsRunning(false);
            setVisualState('idle');
            setStatusMessage('Completed');
            es.close();
            break;

          case 'error':
            if (data.partialText) {
              setAssistantText((prev) => (prev ? prev : data.partialText));
            }
            setIsRunning(false);
            setVisualState('error');
            setStatusMessage(`Error: ${data.message}`);
            es.close();
            break;

          case 'cancelled':
            setIsRunning(false);
            setVisualState('idle');
            setStatusMessage('Run cancelled');
            es.close();
            break;
        }
      } catch (err) {
        console.error('SSE event parse error:', err);
      }
    };

    es.onerror = () => {
      // EventSource may close normally when run finishes
      if (es.readyState === EventSource.CLOSED) {
        setIsRunning(false);
      }
    };
  };

  // Reconnect on page reload if active run was in session & prewarm API
  useEffect(() => {
    fetch('/api/runs').catch(() => {});
    const savedRunId = sessionStorage.getItem('omi_active_run_id');
    const savedConvId = sessionStorage.getItem('omi_active_conv_id');
    if (savedConvId) setConversationId(savedConvId);
    if (savedRunId) {
      setCurrentRunId(savedRunId);
      connectRunStream(savedRunId);
    }
  }, []);

  // Submit prompt
  const handleStartTask = async (messageText: string) => {
    if (!messageText.trim() || isRunning) return;

    setAssistantText('');
    setToolCalls([]);
    setCitations([]);
    setIsTainted(false);
    setStatusMessage('Initiating agent loop...');
    setVisualState('thinking');

    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText.trim(),
          conversationId: conversationId || undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(`Failed to start run: ${res.statusText}`);
      }

      const { runId, conversationId: newConvId } = await res.json();
      setConversationId(newConvId);
      setCurrentRunId(runId);
      sessionStorage.setItem('omi_active_run_id', runId);
      sessionStorage.setItem('omi_active_conv_id', newConvId);

      connectRunStream(runId);
    } catch (err: any) {
      setIsRunning(false);
      setVisualState('error');
      setStatusMessage(`Error starting task: ${err.message}`);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    const msg = prompt;
    setPrompt('');
    handleStartTask(msg);
  };

  // Cancel run (PRD §5 & §18)
  const handleCancelRun = async () => {
    if (!currentRunId) return;
    await fetch(`/api/runs/${currentRunId}/cancel`, { method: 'POST' });
    if (eventSourceRef.current) eventSourceRef.current.close();
    setIsRunning(false);
    setVisualState('idle');
    setStatusMessage('Cancelled by user');
  };

  // Toggle tool call details expansion
  const handleToggleToolExpand = (id: string) => {
    setToolCalls((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, expanded: !tc.expanded } : tc))
    );
  };

  // Push-to-talk (Voice)
  const toggleVoice = () => {
    if (isListening) return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    setIsListening(true);
    setVisualState('listening');

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setPrompt(transcript);
      handleStartTask(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      setVisualState('idle');
    };

    recognition.onend = () => {
      setIsListening(false);
      if (!isRunning) setVisualState('idle');
    };

    recognition.start();
  };

  // Spacebar to talk
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement !== inputRef.current) {
        e.preventDefault();
        toggleVoice();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isListening, isRunning]);

  const handleNewConversation = () => {
    sessionStorage.removeItem('omi_active_run_id');
    sessionStorage.removeItem('omi_active_conv_id');
    setCurrentRunId(null);
    setConversationId('');
    setAssistantText('');
    setToolCalls([]);
    setCitations([]);
    setStatusMessage('');
    setVisualState('idle');
    setIsRunning(false);
  };

  const hasRunContent = Boolean(currentRunId || isRunning || assistantText || toolCalls.length > 0);

  return (
    <>
      {/* NAVBAR */}
      <nav className="navbar">
        <div className="brand">
          <div className="brand-name">OMI</div>
          <div className="brand-line" />
          <div className="brand-subtitle">One Mind Intelligence</div>
        </div>

        <button
          type="button"
          className="menu"
          id="menuButton"
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      {/* SLIDE-IN MENU PANEL */}
      <MenuPanel
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNewConversation={handleNewConversation}
        onOpenPasteEmail={() => setIsEmailModalOpen(true)}
        onOpenHistory={() => alert('Conversations are recorded in your local SQLite DB (omi.db).')}
        onOpenMemory={() => setIsMemoryModalOpen(true)}
      />

      {/* MAIN CONTENT AREA */}
      <main className={`main ${hasRunContent ? 'has-run' : ''}`}>
        {/* REACTIVE OBSIDIAN ORB & DYNAMIC WAVEFORM */}
        <OrbCore state={visualState} />

        {/* GREETING (Shown on idle / new run) */}
        {!hasRunContent && (
          <section className="greeting">
            <h1>{greeting}</h1>
            <p>How can I help you today?</p>
          </section>
        )}

        {/* AGENT RUN STREAMING VIEW (PRD §14 & §18) */}
        {hasRunContent && (
          <AgentRunStream
            statusMessage={statusMessage}
            isRunning={isRunning}
            isTainted={isTainted}
            elapsedSeconds={elapsedSeconds}
            toolCalls={toolCalls}
            assistantText={assistantText}
            citations={citations}
            onCancel={handleCancelRun}
            onToggleToolExpand={handleToggleToolExpand}
          />
        )}

        {/* PROMPT INPUT BAR */}
        <div className="input-wrapper">
          <form className="input-box" id="omiForm" onSubmit={handleSubmit}>
            <button
              type="button"
              className="attach"
              title="Paste email triage (M1) or attach"
              onClick={() => setIsEmailModalOpen(true)}
            >
              ✉
            </button>

            <div className="divider" />

            <input
              ref={inputRef}
              id="prompt"
              type="text"
              autoComplete="off"
              placeholder="Ask OMI anything... (e.g. Compare Fastify and Hono)"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={isRunning}
            />

            <button
              type="button"
              className={`mic ${isListening ? 'active' : ''}`}
              id="micButton"
              onClick={toggleVoice}
              title="Voice input"
            >
              🎙
            </button>
          </form>

          <div className="voice-hint">
            <span>or press</span>
            <span className="space">Space</span>
            <span>to talk</span>
          </div>
        </div>
      </main>

      {/* FOOTER STATUS */}
      <div className="footer-status">
        <span className="status-dot" />
        <span>Always here.</span>
      </div>

      {/* MODALS */}
      <PasteEmailModal
        isOpen={isEmailModalOpen}
        onClose={() => setIsEmailModalOpen(false)}
        onSubmitEmail={(emailText) => {
          handleStartTask(`[EMAIL_TRIAGE_TASK]\nPlease summarize the following email, identify what is being requested, and draft a response for my review:\n\n${emailText}`);
        }}
      />

      <SettingsMemoryModal
        isOpen={isMemoryModalOpen}
        onClose={() => setIsMemoryModalOpen(false)}
      />
    </>
  );
}
