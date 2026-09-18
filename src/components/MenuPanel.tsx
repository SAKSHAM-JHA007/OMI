'use client';

import React from 'react';

interface MenuPanelProps {
  isOpen: boolean;
  onNewConversation: () => void;
  onOpenHistory: () => void;
  onOpenMemory: () => void;
  onOpenPasteEmail: () => void;
  onClose: () => void;
}

export const MenuPanel: React.FC<MenuPanelProps> = ({
  isOpen,
  onNewConversation,
  onOpenHistory,
  onOpenMemory,
  onOpenPasteEmail,
  onClose,
}) => {
  return (
    <div className={`menu-panel ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        onClick={() => {
          onNewConversation();
          onClose();
        }}
      >
        ✦ New conversation
      </button>

      <button
        type="button"
        onClick={() => {
          onOpenPasteEmail();
          onClose();
        }}
      >
        ✉ Paste Email (M1)
      </button>

      <button
        type="button"
        onClick={() => {
          onOpenHistory();
          onClose();
        }}
      >
        ⏱ Conversation history
      </button>

      <button
        type="button"
        onClick={() => {
          onOpenMemory();
          onClose();
        }}
      >
        ⚙ Settings & Memory (PRD §9)
      </button>
    </div>
  );
};
