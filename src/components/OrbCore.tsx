'use client';

import React from 'react';

export type AgentVisualState = 'idle' | 'listening' | 'thinking' | 'working' | 'speaking' | 'error';

interface OrbCoreProps {
  state: AgentVisualState;
}

export const OrbCore: React.FC<OrbCoreProps> = ({ state }) => {
  return (
    <div className={`core-area state-${state}`}>
      {/* Dynamic Animated Waveform */}
      <svg className="wave" viewBox="0 0 800 100" preserveAspectRatio="none">
        <path
          d="
            M0 50
            C80 50 90 25 160 50
            S250 75 320 50
            S400 25 470 50
            S560 75 630 50
            S720 25 800 50
          "
        />
        <path
          className="wave2"
          d="
            M0 50
            C100 70 120 30 200 50
            S300 70 400 50
            S500 30 600 50
            S700 70 800 50
          "
        />
      </svg>

      {/* Breathing, Concentric Rotating Orb */}
      <div className="core">
        <div className="core-light" />
      </div>
    </div>
  );
};
