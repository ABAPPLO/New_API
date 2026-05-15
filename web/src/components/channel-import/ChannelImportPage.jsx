import React, { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  Form,
  Input,
  Table,
  Tabs,
  TabPane,
  Tag,
  Space,
  Banner,
  Spin,
  Modal,
  Upload,
  Typography,
  Tooltip,
} from '@douyinfe/semi-ui';
import { API, showError, showSuccess, showInfo } from '../../helpers';
import { CHANNEL_OPTIONS } from '../../constants';
import { IconUpload, IconDownload, IconRefresh, IconInherit } from '@douyinfe/semi-icons';

const { Text } = Typography;

// Build type ID -> label map from CHANNEL_OPTIONS
const TYPE_MAP = {};
for (const opt of CHANNEL_OPTIONS) {
  TYPE_MAP[opt.value] = opt.label;
}

const TYPE_COLORS = {};
for (const opt of CHANNEL_OPTIONS) {
  TYPE_COLORS[opt.value] = opt.color;
}

function getChannelTypeName(type) {
  return TYPE_MAP[type] || `Type ${type}`;
}

function getChannelTypeColor(type) {
  return TYPE_COLORS[type] || 'grey';
}

function truncateModels(models, maxLen = 50) {
  if (!models) return '-';
  const str = models;
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}

export default function ChannelImportPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('online');

  // Source config
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');

  // Preview data
  const [channels, setChannels] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [source, setSource] = useState(''); // 'online' or 'file'

  const fetchRemote = useCallback(async () => {
    const url = baseUrl.trim().replace(/\/+$/, '');
    if (!url) {
      showError(t('请输入远程平台地址'));
      return;
    }
    if (!token.trim()) {
      showError(t('请输入管理员令牌'));
      return;
    }

    setLoading(true);
    setChannels([]);
    setSelectedRowKeys([]);
    try {
      const res = await API.post('/api/channel/import/fetch', {
        base_url: url,
        token: token.trim(),
      });
      const { success, data, message } = res.data;
      if (success) {
        const list = data || [];
        setChannels(list);
        setSource('online');
        showSuccess(t('获取远程渠道成功，共 {{count}} 个').replace('{{count}}', list.length));
      } else {
        showError(message || t('获取远程渠道失败'));
      }
    } catch (e) {
      showError(e.message || t('网络请求失败'));
    } finally {
      setLoading(false);
    }
  }, [baseUrl, token, t]);

  const handleFileUpload = useCallback((file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        let list = [];
        if (Array.isArray(parsed)) {
          list = parsed;
        } else if (parsed.success && Array.isArray(parsed.data)) {
          // Handle new-api response format
          list = parsed.data;
        } else {
          showError(t('请上传有效的渠道JSON文件（数组或标准响应格式）'));
          return;
        }

        if (list.length === 0) {
          showError(t('文件中没有有效的渠道数据'));
          return;
        }

        setChannels(list);
        setSelectedRowKeys([]);
        setSource('file');
        showSuccess(t('解析文件成功，共 {{count}} 个渠道').replace('{{count}}', list.length));
      } catch (err) {
        showError(t('JSON解析失败：') + err.message);
      }
    };
    reader.readAsText(file);
    return false; // prevent auto upload
  }, [t]);

  const handleImport = useCallback(async () => {
    if (selectedRowKeys.length === 0) {
      showError(t('请至少选择一个渠道'));
      return;
    }

    const selectedChannels = selectedRowKeys.map((key) => channels[key]).filter(Boolean);
    if (selectedChannels.length === 0) return;

    setImporting(true);
    try {
      const res = await API.post('/api/channel/import', {
        channels: selectedChannels,
      });
      const { success, data, message } = res.data;
      if (success) {
        const { succeeded, failed } = data;
        const failedCount = failed ? failed.length : 0;

        if (failedCount === 0) {
          showSuccess(t('导入完成，成功 {{count}} 个').replace('{{count}}', succeeded));
        } else {
          // Show result modal
          let failedList = failed.map((f) => `${f.name}: ${f.error}`).join('\n');
          Modal.info({
            title: t('导入结果'),
            content: (
              <div>
                <p>{t('成功导入 {{count}} 个渠道').replace('{{count}}', succeeded)}</p>
                <p>{t('失败 {{count}} 个').replace('{{count}}', failedCount)}</p>
                <pre className='mt-2 text-xs whitespace-pre-wrap max-h-40 overflow-auto'>
                  {failedList}
                </pre>
              </div>
            ),
          });

          // Remove succeeded from list, keep failed selected for retry
          if (succeeded > 0) {
            const failedNames = new Set(failed.map((f) => f.name));
            const remaining = channels.filter((ch) => failedNames.has(ch.name));
            setChannels(remaining);
            setSelectedRowKeys(remaining.map((_, i) => i));
          }
        }
      } else {
        showError(message || t('导入失败'));
      }
    } catch (e) {
      showError(e.message || t('导入请求失败'));
    } finally {
      setImporting(false);
    }
  }, [channels, selectedRowKeys, t]);

  const selectAll = useCallback(() => {
    setSelectedRowKeys(channels.map((_, i) => i));
  }, [channels]);

  const deselectAll = useCallback(() => {
    setSelectedRowKeys([]);
  }, []);

  const columns = useMemo(
    () => [
      {
        title: t('渠道名称'),
        dataIndex: 'name',
        key: 'name',
        width: 180,
        ellipsis: true,
      },
      {
        title: t('类型'),
        dataIndex: 'type',
        key: 'type',
        width: 150,
        render: (type) => (
          <Tag color={getChannelTypeColor(type)} shape='circle' type='light'>
            {getChannelTypeName(type)}
          </Tag>
        ),
      },
      {
        title: 'Base URL',
        dataIndex: 'base_url',
        key: 'base_url',
        width: 250,
        ellipsis: true,
        render: (text) => (
          <Tooltip content={text}>
            <Text>{text || '-'}</Text>
          </Tooltip>
        ),
      },
      {
        title: t('模型'),
        dataIndex: 'models',
        key: 'models',
        width: 300,
        ellipsis: true,
        render: (models) => (
          <Tooltip content={models}>
            <Text>{truncateModels(models)}</Text>
          </Tooltip>
        ),
      },
      {
        title: t('分组'),
        dataIndex: 'group',
        key: 'group',
        width: 120,
        ellipsis: true,
        render: (text) => <Text>{text || 'default'}</Text>,
      },
      {
        title: t('标签'),
        dataIndex: 'tag',
        key: 'tag',
        width: 100,
        render: (text) => (text ? <Tag type='light'>{text}</Tag> : '-'),
      },
    ],
    [t],
  );

  const rowSelection = useMemo(
    () => ({
      selectedRowKeys,
      onChange: setSelectedRowKeys,
    }),
    [selectedRowKeys],
  );

  const dataSource = useMemo(
    () => channels.map((ch, idx) => ({ ...ch, _rowKey: idx })),
    [channels],
  );

  return (
    <div className='flex flex-col gap-4 max-w-[1400px] mx-auto'>
      <Card>
        <Tabs activeKey={activeTab} onChange={setActiveTab} type='button'>
          <TabPane tab={t('在线拉取')} itemKey='online'>
            <div className='flex flex-col gap-4 mt-2'>
              <Banner
                type='info'
                description={t('输入其他 new-api 平台的管理员地址和令牌，拉取渠道配置后选择导入')}
                closable={false}
              />
              <Form layout='horizontal' labelPosition='left'>
                <Form.Input
                  field='base_url'
                  label={t('远程平台地址')}
                  placeholder='https://your-other-newapi.example.com'
                  value={baseUrl}
                  onChange={setBaseUrl}
                  style={{ width: 400 }}
                />
                <Form.Input
                  field='token'
                  label={t('管理员令牌')}
                  placeholder={t('管理员账号的 Session Token 或 API Key')}
                  mode='password'
                  value={token}
                  onChange={setToken}
                  style={{ width: 400 }}
                />
              </Form>
              <div>
                <Button
                  theme='primary'
                  icon={<IconRefresh />}
                  loading={loading}
                  onClick={fetchRemote}
                >
                  {t('获取渠道')}
                </Button>
              </div>
            </div>
          </TabPane>
          <TabPane tab={t('文件上传')} itemKey='file'>
            <div className='flex flex-col gap-4 mt-2'>
              <Banner
                type='info'
                description={t('上传从其他 new-api 平台导出的渠道 JSON 文件（支持数组格式或标准 API 响应格式）')}
                closable={false}
              />
              <Upload
                accept='.json'
                draggable
                customRequest={({ file }) => handleFileUpload(file)}
                showUploadList={false}
                dragMainText={t('点击或拖拽文件到此区域上传')}
                dragSubText={t('仅支持 .json 文件')}
                style={{ width: 400 }}
              />
            </div>
          </TabPane>
        </Tabs>
      </Card>

      {channels.length > 0 && (
        <Card
          title={
            <div className='flex items-center justify-between w-full'>
              <span>
                {t('预览渠道')} ({channels.length})
              </span>
              <Space>
                <Text type='tertiary'>
                  {t('已选择 {{count}} 个').replace('{{count}}', selectedRowKeys.length)}
                </Text>
                <Button size='small' onClick={selectAll}>
                  {t('全选')}
                </Button>
                <Button size='small' onClick={deselectAll}>
                  {t('取消全选')}
                </Button>
                <Button
                  theme='primary'
                  icon={<IconDownload />}
                  loading={importing}
                  onClick={handleImport}
                  disabled={selectedRowKeys.length === 0}
                >
                  {t('开始导入')} ({selectedRowKeys.length})
                </Button>
              </Space>
            </div>
          }
        >
          <Table
            columns={columns}
            dataSource={dataSource}
            rowKey='_rowKey'
            rowSelection={rowSelection}
            pagination={{ pageSize: 20 }}
            size='small'
            bordered
          />
        </Card>
      )}

      {loading && (
        <div className='flex justify-center py-8'>
          <Spin size='large' tip={t('正在获取远程渠道...')} />
        </div>
      )}
    </div>
  );
}
