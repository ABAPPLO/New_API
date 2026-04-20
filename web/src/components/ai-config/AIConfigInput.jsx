import React, { useState } from 'react';
import { TextArea, Button } from '@douyinfe/semi-ui';
import { useTranslation } from 'react-i18next';

const URL_REGEX = /^https?:\/\/.+/;

const AIConfigInput = ({ onSend, isLoading, onStop, onClear }) => {
  const { t } = useTranslation();
  const [input, setInput] = useState('');

  const handleSend = () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const isUrl = URL_REGEX.test(text);
    onSend(text, isUrl);
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="border-t px-4 py-3"
      style={{ borderColor: 'var(--semi-color-border)' }}
    >
      <div className="flex gap-2 items-end">
        <TextArea
          value={input}
          onChange={setInput}
          onKeyDown={handleKeyDown}
          placeholder={t('输入文档URL或粘贴文档文本...')}
          autosize
          maxRows={4}
          disabled={isLoading}
          style={{ flex: 1 }}
        />
        <div className="flex gap-1">
          {isLoading ? (
            <Button size="small" theme="danger" onClick={onStop}>
              {t('停止')}
            </Button>
          ) : (
            <>
              <Button
                size="small"
                theme="solid"
                onClick={handleSend}
                disabled={!input.trim()}
              >
                {t('发送')}
              </Button>
              <Button
                size="small"
                theme="borderless"
                onClick={onClear}
              >
                {t('清空')}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default AIConfigInput;
