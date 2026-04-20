import React, { useRef, useEffect } from 'react';
import { Typography, Spin } from '@douyinfe/semi-ui';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';

const MessageBubble = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? 'bg-[var(--semi-color-primary)] text-white'
            : 'bg-[var(--semi-color-fill-0)] text-[var(--semi-color-text-0)]'
        }`}
        style={{ wordBreak: 'break-word' }}
      >
        {message.loading ? (
          <div className="flex items-center gap-2">
            <Spin size="small" />
            <span className="text-xs opacity-70">...</span>
          </div>
        ) : isUser ? (
          <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
        ) : (
          <div className="ai-config-markdown">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

const AIConfigChatArea = ({ messages, isLoading }) => {
  const { t } = useTranslation();
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full opacity-50">
          <Typography.Text type="tertiary" size="small">
            {t('粘贴文档URL或文本，AI自动生成渠道配置')}
          </Typography.Text>
        </div>
      )}
      {messages.map((msg) => (
        <MessageBubble key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
};

export default AIConfigChatArea;
