/*
Copyright (C) 2025 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Table,
  Spin,
  Button,
  Typography,
  Empty,
  Input,
  Select,
  Space,
  Tag,
} from '@douyinfe/semi-ui';
import {
  IllustrationNoResult,
  IllustrationNoResultDark,
} from '@douyinfe/semi-illustrations';
import { IconSearch, IconStar, IconBolt } from '@douyinfe/semi-icons';
import { API, showError, showSuccess } from '../../../../helpers';
import { MODEL_TABLE_PAGE_SIZE } from '../../../../constants';
import { useIsMobile } from '../../../../hooks/common/useIsMobile';
import {
  MODEL_TYPE_COLORS,
  MODEL_TYPE_LABELS,
  detectModelType,
} from '../../../../pages/Setting/Ratio/hooks/useModelPricingEditorState';

const parseOptionJSON = (rawValue) => {
  if (!rawValue || typeof rawValue !== 'string' || rawValue.trim() === '')
    return {};
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const MODEL_TYPES = ['text', 'image', 'video', 'audio'];

const MissingModelsModal = ({
  visible,
  onClose,
  onConfigureModel,
  onRefresh,
  t,
}) => {
  const [loading, setLoading] = useState(false);
  const [missingModels, setMissingModels] = useState([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const isMobile = useIsMobile();

  // Smart fill states
  const [smartFillVisible, setSmartFillVisible] = useState(false);
  const [smartFillLoading, setSmartFillLoading] = useState(false);
  const [modelTypes, setModelTypes] = useState({});
  const [ratioOptions, setRatioOptions] = useState({});

  // Smart detect states
  const [llmModel, setLlmModel] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [enabledModels, setEnabledModels] = useState([]);

  const fetchMissing = async () => {
    setLoading(true);
    try {
      const res = await API.get('/api/models/missing');
      if (res.data.success) {
        const data = res.data.data || [];
        setMissingModels(data);
        // Auto-detect types as initial guess
        const types = {};
        for (const name of data) {
          types[name] = detectModelType(name);
        }
        setModelTypes(types);
      } else {
        showError(res.data.message);
      }
    } catch (_) {
      showError(t('获取未配置模型失败'));
    }
    setLoading(false);
  };

  const fetchRatioOptions = async () => {
    try {
      const res = await API.get('/api/option/');
      if (res.data.success) {
        setRatioOptions(res.data.data || {});
      }
    } catch {
      // ignore
    }
  };

  const fetchEnabledModels = async () => {
    try {
      const res = await API.get('/api/channel/models_enabled');
      if (res.data.success) {
        setEnabledModels(res.data.data || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (visible) {
      fetchMissing();
      fetchRatioOptions();
      fetchEnabledModels();
      setSearchKeyword('');
      setCurrentPage(1);
      setSmartFillVisible(false);
      setLlmModel('');
    } else {
      setMissingModels([]);
    }
  }, [visible]);

  // Models that already have pricing (for default ratio in batch fill)
  const configuredModels = useMemo(() => {
    const modelRatioMap = parseOptionJSON(ratioOptions.ModelRatio);
    const modelPriceMap = parseOptionJSON(ratioOptions.ModelPrice);
    const names = new Set([
      ...Object.keys(modelRatioMap),
      ...Object.keys(modelPriceMap),
    ]);
    return Array.from(names).sort();
  }, [ratioOptions.ModelRatio, ratioOptions.ModelPrice]);

  // Type distribution stats
  const typeStats = useMemo(() => {
    const stats = { text: 0, image: 0, video: 0, audio: 0 };
    for (const name of missingModels) {
      const type = modelTypes[name] || 'text';
      stats[type] = (stats[type] || 0) + 1;
    }
    return stats;
  }, [missingModels, modelTypes]);

  // Filter and pagination
  const filteredModels = missingModels.filter((model) =>
    model.toLowerCase().includes(searchKeyword.toLowerCase()),
  );

  const dataSource = (() => {
    const start = (currentPage - 1) * MODEL_TABLE_PAGE_SIZE;
    const end = start + MODEL_TABLE_PAGE_SIZE;
    return filteredModels.slice(start, end).map((model) => ({
      model,
      key: model,
    }));
  })();

  const handleModelTypeChange = (name, type) => {
    setModelTypes((prev) => ({ ...prev, [name]: type }));
  };

  // Smart detect: call LLM to classify models
  const handleSmartDetect = async () => {
    if (!llmModel) {
      showError(t('请先选择 LLM 模型'));
      return;
    }
    setDetecting(true);
    try {
      const res = await API.post('/api/models/smart_detect', {
        model_names: missingModels,
        llm_model: llmModel,
      });
      if (res.data.success && res.data.type_map) {
        const detected = res.data.type_map;
        // Merge detected types, fallback to existing for undetected
        const newTypes = { ...modelTypes };
        for (const [name, type] of Object.entries(detected)) {
          if (MODEL_TYPES.includes(type)) {
            newTypes[name] = type;
          }
        }
        setModelTypes(newTypes);
        showSuccess(res.data.message);
      } else {
        showError(res.data.message || t('智能识别失败'));
      }
    } catch {
      showError(t('智能识别失败'));
    } finally {
      setDetecting(false);
    }
  };

  // Batch smart fill: create metadata + pricing
  const handleSmartFill = async () => {
    setSmartFillLoading(true);
    try {
      const models = missingModels.map((name) => ({
        name,
        type: modelTypes[name] || 'text',
      }));
      const modelRatioMap = parseOptionJSON(ratioOptions.ModelRatio);
      const defaultRatio = modelRatioMap[configuredModels[0]] || 1.0;

      const res = await API.post('/api/models/batch_smart_fill', {
        models,
        default_ratio: defaultRatio,
      });
      if (res.data.success) {
        showSuccess(res.data.message);
        setSmartFillVisible(false);
        onRefresh?.();
        onClose();
      } else {
        showError(res.data.message);
      }
    } catch {
      showError(t('智能填充失败'));
    } finally {
      setSmartFillLoading(false);
    }
  };

  const columns = [
    {
      title: t('模型名称'),
      dataIndex: 'model',
      render: (text) => (
        <div className='flex items-center'>
          <Typography.Text strong>{text}</Typography.Text>
        </div>
      ),
    },
    {
      title: t('输出类型'),
      dataIndex: 'type',
      width: 120,
      render: (_, record) => (
        <Select
          size='small'
          value={modelTypes[record.model] || 'text'}
          onChange={(val) => handleModelTypeChange(record.model, val)}
          style={{ width: 90 }}
          showClear={false}
        >
          {MODEL_TYPES.map((type) => (
            <Select.Option key={type} value={type}>
              <Tag size='small' color={MODEL_TYPE_COLORS[type]}>
                {t(MODEL_TYPE_LABELS[type])}
              </Tag>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: '',
      dataIndex: 'operate',
      fixed: 'right',
      width: 120,
      render: (text, record) => (
        <Button
          type='primary'
          size='small'
          onClick={() => onConfigureModel(record.model)}
        >
          {t('配置')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Modal
        title={
          <div className='flex flex-col gap-2 w-full'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-2'>
                <Typography.Text
                  strong
                  className='!text-[var(--semi-color-text-0)] !text-base'
                >
                  {t('未配置的模型列表')}
                </Typography.Text>
                <Typography.Text type='tertiary' size='small'>
                  {t('共')} {missingModels.length} {t('个未配置模型')}
                </Typography.Text>
              </div>
              {missingModels.length > 0 && (
                <Button
                  theme='solid'
                  type='primary'
                  size='small'
                  icon={<IconStar />}
                  onClick={() => setSmartFillVisible(true)}
                >
                  {t('智能填充')}
                </Button>
              )}
            </div>
          </div>
        }
        visible={visible}
        onCancel={onClose}
        footer={null}
        size={isMobile ? 'full-width' : 'medium'}
        className='!rounded-lg'
      >
        <Spin spinning={loading}>
          {missingModels.length === 0 && !loading ? (
            <Empty
              image={
                <IllustrationNoResult style={{ width: 150, height: 150 }} />
              }
              darkModeImage={
                <IllustrationNoResultDark
                  style={{ width: 150, height: 150 }}
                />
              }
              description={t('暂无缺失模型')}
              style={{ padding: 30 }}
            />
          ) : (
            <div className='missing-models-content'>
              <div className='flex items-center justify-end gap-2 w-full mb-4'>
                <Input
                  placeholder={t('搜索模型...')}
                  value={searchKeyword}
                  onChange={(v) => {
                    setSearchKeyword(v);
                    setCurrentPage(1);
                  }}
                  className='!w-full'
                  prefix={<IconSearch />}
                  showClear
                />
              </div>

              {filteredModels.length > 0 ? (
                <Table
                  columns={columns}
                  dataSource={dataSource}
                  pagination={{
                    currentPage: currentPage,
                    pageSize: MODEL_TABLE_PAGE_SIZE,
                    total: filteredModels.length,
                    showSizeChanger: false,
                    onPageChange: (page) => setCurrentPage(page),
                  }}
                />
              ) : (
                <Empty
                  image={
                    <IllustrationNoResult
                      style={{ width: 100, height: 100 }}
                    />
                  }
                  darkModeImage={
                    <IllustrationNoResultDark
                      style={{ width: 100, height: 100 }}
                    />
                  }
                  description={
                    searchKeyword
                      ? t('未找到匹配的模型')
                      : t('暂无缺失模型')
                  }
                  style={{ padding: 20 }}
                />
              )}
            </div>
          )}
        </Spin>
      </Modal>

      {/* Smart Fill Modal */}
      <Modal
        title={t('智能填充')}
        visible={smartFillVisible}
        onCancel={() => setSmartFillVisible(false)}
        footer={null}
        size={isMobile ? 'full-width' : 'medium'}
      >
        {/* LLM Smart Detect Section */}
        <div
          style={{
            marginBottom: 16,
            padding: 16,
            background: 'var(--semi-color-fill-0)',
            borderRadius: 8,
          }}
        >
          <div className='mb-2 font-medium'>{t('智能识别')}</div>
          <div className='text-xs text-gray-500 mb-3'>
            {t(
              '选择一个 LLM 模型，让其根据自身知识判断每个模型的输出类型。',
            )}
          </div>
          <div className='flex items-center gap-2'>
            <Select
              style={{ flex: 1 }}
              placeholder={t('选择 LLM 模型（如 gpt-4o-mini）')}
              value={llmModel}
              onChange={setLlmModel}
              showClear
              filter
            >
              {enabledModels.map((name) => (
                <Select.Option key={name} value={name}>
                  {name}
                </Select.Option>
              ))}
            </Select>
            <Button
              theme='solid'
              icon={<IconBolt />}
              loading={detecting}
              disabled={!llmModel || missingModels.length === 0}
              onClick={handleSmartDetect}
            >
              {t('智能识别')}
            </Button>
          </div>
        </div>

        {/* Type Distribution */}
        <div style={{ marginBottom: 16 }}>
          <div className='mb-2 font-medium'>{t('模型类型分布')}</div>
          <Space wrap>
            {Object.entries(typeStats)
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <Tag key={type} color={MODEL_TYPE_COLORS[type]} size='large'>
                  {t(MODEL_TYPE_LABELS[type])}: {count}
                </Tag>
              ))}
          </Space>
          <div className='mt-2 text-xs text-gray-500'>
            {t(
              '共 {{count}} 个未配置模型。识别后可在列表中手动调整。',
              { count: missingModels.length },
            )}
          </div>
        </div>

        {/* Confirm button */}
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--semi-color-primary-light-default)',
            border: '1px solid var(--semi-color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <Typography.Text>
            {t('确认后将自动创建模型元数据并设置定价。')}
          </Typography.Text>
          <Button
            theme='solid'
            type='primary'
            loading={smartFillLoading}
            onClick={handleSmartFill}
          >
            {t('确认填充')}
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default MissingModelsModal;
