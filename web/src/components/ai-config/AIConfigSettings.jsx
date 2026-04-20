import React, { useState, useEffect } from 'react';
import { Input, Typography } from '@douyinfe/semi-ui';
import { loadSettings, saveSettings } from '../../hooks/useAIConfigChat';
import { useTranslation } from 'react-i18next';

const AIConfigSettings = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  return (
    <div
      className="border-b px-4 py-3"
      style={{ borderColor: 'var(--semi-color-border)' }}
    >
      <Typography.Text
        type="tertiary"
        size="small"
        className="block mb-2"
      >
        {t('AI 设置（密钥仅保存在浏览器本地）')}
      </Typography.Text>
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('API 端点，如 https://api.openai.com/v1/chat/completions')}
          value={settings.endpoint}
          onChange={(v) => setSettings((s) => ({ ...s, endpoint: v }))}
          size="small"
        />
        <Input
          mode="password"
          placeholder={t('API 密钥')}
          value={settings.apiKey}
          onChange={(v) => setSettings((s) => ({ ...s, apiKey: v }))}
          size="small"
        />
        <Input
          placeholder={t('模型名称，如 gpt-4o')}
          value={settings.model}
          onChange={(v) => setSettings((s) => ({ ...s, model: v }))}
          size="small"
        />
      </div>
    </div>
  );
};

export default AIConfigSettings;
