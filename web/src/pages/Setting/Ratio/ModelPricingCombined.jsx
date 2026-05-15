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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Modal,
  Radio,
  RadioGroup,
  Select,
  Space,
  Tag,
  Typography,
} from '@douyinfe/semi-ui';
import { IconStar } from '@douyinfe/semi-icons';
import { useTranslation } from 'react-i18next';
import { API, showError, showSuccess } from '../../../helpers';
import ModelPricingEditor from './components/ModelPricingEditor';
import ModelRatioSettings from './ModelRatioSettings';
import {
  MODEL_TYPE_COLORS,
  MODEL_TYPE_LABELS,
  detectModelType,
} from './hooks/useModelPricingEditorState';

const { Text } = Typography;

const parseOptionJSON = (rawValue) => {
  if (!rawValue || rawValue.trim() === '') return {};
  try {
    const parsed = JSON.parse(rawValue);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export default function ModelPricingCombined({ options, refresh }) {
  const { t } = useTranslation();
  const [editMode, setEditMode] = useState('visual');
  const [enabledModels, setEnabledModels] = useState([]);
  const [smartFillVisible, setSmartFillVisible] = useState(false);
  const [referenceModelName, setReferenceModelName] = useState('');
  const [smartFillFn, setSmartFillFn] = useState(null);
  const [modelTypes, setModelTypes] = useState({});

  const getAllEnabledModels = async () => {
    try {
      const res = await API.get('/api/channel/models_enabled');
      const { success, data } = res.data;
      if (success) {
        setEnabledModels(data || []);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    getAllEnabledModels();
  }, []);

  // Auto-detect types for unconfigured models
  useEffect(() => {
    const modelRatioMap = parseOptionJSON(options?.ModelRatio);
    const modelPriceMap = parseOptionJSON(options?.ModelPrice);
    const newTypes = {};
    for (const name of enabledModels) {
      const hasRatio =
        modelRatioMap[name] !== undefined && modelRatioMap[name] !== null;
      const hasPrice =
        modelPriceMap[name] !== undefined && modelPriceMap[name] !== null;
      if (!hasRatio && !hasPrice) {
        newTypes[name] = detectModelType(name);
      }
    }
    setModelTypes((prev) => {
      const merged = { ...prev };
      for (const k of Object.keys(merged)) {
        if (!(k in newTypes)) delete merged[k];
      }
      return { ...merged, ...newTypes };
    });
  }, [enabledModels, options?.ModelRatio, options?.ModelPrice]);

  const unsetModels = useMemo(() => {
    const modelRatioMap = parseOptionJSON(options?.ModelRatio);
    const modelPriceMap = parseOptionJSON(options?.ModelPrice);
    return enabledModels.filter((name) => {
      const hasRatio =
        modelRatioMap[name] !== undefined && modelRatioMap[name] !== null;
      const hasPrice =
        modelPriceMap[name] !== undefined && modelPriceMap[name] !== null;
      return !hasRatio && !hasPrice;
    });
  }, [enabledModels, options?.ModelRatio, options?.ModelPrice]);

  const unsetCount = unsetModels.length;

  const configuredModels = useMemo(() => {
    const modelRatioMap = parseOptionJSON(options?.ModelRatio);
    const modelPriceMap = parseOptionJSON(options?.ModelPrice);
    const names = new Set([
      ...Object.keys(modelRatioMap),
      ...Object.keys(modelPriceMap),
    ]);
    return Array.from(names).sort();
  }, [options?.ModelRatio, options?.ModelPrice]);

  const typeStats = useMemo(() => {
    const stats = { text: 0, image: 0, video: 0, audio: 0 };
    for (const name of unsetModels) {
      const type = modelTypes[name] || 'text';
      stats[type] = (stats[type] || 0) + 1;
    }
    return stats;
  }, [unsetModels, modelTypes]);

  const handleSmartFillReady = useCallback((fn) => {
    setSmartFillFn(() => fn);
  }, []);

  const handleSmartFillConfirm = () => {
    if (!smartFillFn) return;
    const modelRatioMap = parseOptionJSON(options?.ModelRatio);
    const refRatio = modelRatioMap[referenceModelName];
    const inputPrice = refRatio !== undefined ? String(refRatio * 2) : '2';
    smartFillFn(inputPrice, modelTypes);
    setSmartFillVisible(false);
    showSuccess(
      t('已智能填充 {{count}} 个模型，请点击"应用更改"保存', {
        count: unsetCount,
      }),
    );
  };

  return (
    <div>
      <div
        style={{
          marginTop: 12,
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 8,
        }}
      >
        <RadioGroup
          type='button'
          size='small'
          value={editMode}
          onChange={(e) => setEditMode(e.target.value)}
        >
          <Radio value='visual'>{t('可视化编辑')}</Radio>
          <Radio value='manual'>{t('手动编辑')}</Radio>
        </RadioGroup>
        {editMode === 'visual' && unsetCount > 0 && smartFillFn && (
          <Button
            theme='solid'
            type='primary'
            icon={<IconStar />}
            onClick={() => setSmartFillVisible(true)}
          >
            {t('智能填充 ({{count}} 个未配置)', { count: unsetCount })}
          </Button>
        )}
      </div>
      {editMode === 'visual' ? (
        <ModelPricingEditor
          options={options}
          refresh={refresh}
          candidateModelNames={enabledModels}
          onSmartFillReady={handleSmartFillReady}
        />
      ) : (
        <ModelRatioSettings options={options} refresh={refresh} />
      )}

      <Modal
        title={t('智能填充')}
        visible={smartFillVisible}
        onCancel={() => setSmartFillVisible(false)}
        onOk={handleSmartFillConfirm}
        okText={t('确认填充')}
        okButtonProps={{ disabled: !referenceModelName || unsetCount === 0 }}
      >
        <div style={{ marginBottom: 16 }}>
          <div className='mb-2 font-medium'>{t('选择参考模型')}</div>
          <Select
            style={{ width: '100%' }}
            placeholder={t('选择一个已配置定价的模型作为参考')}
            value={referenceModelName}
            onChange={setReferenceModelName}
            showClear
            filter
          >
            {configuredModels.map((name) => (
              <Select.Option key={name} value={name}>
                {name}
              </Select.Option>
            ))}
          </Select>
          <div className='mt-2 text-xs text-gray-500'>
            {t(
              '文本/音频模型将使用参考模型的输入倍率，图片/视频模型将使用按次计费（$0.04/次）。',
            )}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div className='mb-2 font-medium'>{t('模型类型分布')}</div>
          <Space wrap>
            {Object.entries(typeStats)
              .filter(([, count]) => count > 0)
              .map(([type, count]) => (
                <Tag key={type} color={MODEL_TYPE_COLORS[type]}>
                  {t(MODEL_TYPE_LABELS[type])}: {count}
                </Tag>
              ))}
          </Space>
          <div className='mt-2 text-xs text-gray-500'>
            {t('共 {{count}} 个未配置模型。', { count: unsetCount })}
          </div>
        </div>

        {referenceModelName && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--semi-color-primary-light-default)',
              border: '1px solid var(--semi-color-primary)',
            }}
          >
            <Text>
              {t(
                '将以 {{name}} 的倍率为基准，为 {{count}} 个未配置模型智能填充定价。',
                { name: referenceModelName, count: unsetCount },
              )}
            </Text>
          </div>
        )}
      </Modal>
    </div>
  );
}
