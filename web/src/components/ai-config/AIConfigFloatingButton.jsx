import React from 'react';
import { Button } from '@douyinfe/semi-ui';

const AIConfigFloatingButton = ({ onClick, visible }) => {
  if (visible) return null;

  return (
    <Button
      icon={
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 8V4H8" />
          <rect width="16" height="12" x="4" y="8" rx="2" />
          <path d="M2 14h2" />
          <path d="M20 14h2" />
          <path d="M15 13v2" />
          <path d="M9 13v2" />
        </svg>
      }
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        zIndex: 1000,
        width: 48,
        height: 48,
        borderRadius: '50%',
        padding: 0,
        background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        border: 'none',
        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.2s, box-shadow 0.2s',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'scale(1.1)';
        e.currentTarget.style.boxShadow = '0 6px 16px rgba(99, 102, 241, 0.6)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'scale(1)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(99, 102, 241, 0.4)';
      }}
      onClick={onClick}
    />
  );
};

export default AIConfigFloatingButton;
