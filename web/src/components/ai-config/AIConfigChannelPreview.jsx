import React, { useState } from 'react';
import { Button, Input, Typography, Tag, Card } from '@douyinfe/semi-ui';
import { API, showSuccess, showError } from '../../helpers';
import { useTranslation } from 'react-i18next';

const AIConfigChannelPreview = ({ config, onConfigCreated }) => {
  const { t } = useTranslation();
  const [channelKey, setChannelKey] = useState('');
  const [creating, setCreating] = useState(false);

  const confidenceColor = {
    high: 'green',
    medium: 'orange',
    low: 'red',
  };

  const handleCreate = async () => {
    if (!channelKey.trim()) {
      showError(t('请输入该渠道的 API 密钥'));
      return;
    }

    setCreating(true);
    try {
      const res = await API.post('/api/channel/', {
        mode: 'single',
        channel: {
          type: config.channel_type,
          name: config.name || config.channel_type_name,
          key: channelKey.trim(),
          base_url: config.base_url || '',
          models: (config.models || []).join(','),
          group: config.group || 'default',
        },
      });
      const { success, message } = res.data;
      if (success) {
        showSuccess(t('渠道创建成功'));
        onConfigCreated?.();
      } else {
        showError(message);
      }
    } catch (err) {
      showError(err.message || t('创建失败'));
    } finally {
      setCreating(false);
    }
  };

  return (
    <Card
      className="mx-4 mb-2"
      bodyStyle={{ padding: '12px' }}
      style={{
        borderColor: 'var(--semi-color-primary)',
        borderWidth: 1,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <Typography.Text strong>{t('渠道配置预览')}</Typography.Text>
        <Tag
          color={confidenceColor[config.confidence] || 'grey'}
          size="small"
        >
          {config.confidence}
        </Tag>
      </div>

      <div className="text-xs space-y-1 mb-3">
        <div>
          <span className="opacity-60">{t('类型')}:</span>{' '}
          <span>
            {config.channel_type} - {config.channel_type_name}
          </span>
        </div>
        {config.base_url && (
          <div>
            <span className="opacity-60">URL:</span> {config.base_url}
          </div>
        )}
        {config.key_format && (
          <div>
            <span className="opacity-60">{t('密钥格式')}:</span>{' '}
            {config.key_format}
          </div>
        )}
        {config.models?.length > 0 && (
          <div>
            <span className="opacity-60">{t('模型')}:</span>{' '}
            <span className="break-all">
              {config.models.slice(0, 10).join(', ')}
              {config.models.length > 10 && ` ...(${config.models.length})`}
            </span>
          </div>
        )}
        {config.notes && (
          <div className="opacity-60 mt-1">{config.notes}</div>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          mode="password"
          placeholder={t('请输入该渠道的 API 密钥')}
          value={channelKey}
          onChange={setChannelKey}
          size="small"
          style={{ flex: 1 }}
        />
        <Button
          theme="solid"
          size="small"
          onClick={handleCreate}
          loading={creating}
        >
          {t('创建渠道')}
        </Button>
      </div>
    </Card>
  );
};

export default AIConfigChannelPreview;
