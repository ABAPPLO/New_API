import React, { useContext, useState } from 'react';
import { SideSheet, Button } from '@douyinfe/semi-ui';
import { UserContext } from '../../context/User';
import AIConfigFloatingButton from './AIConfigFloatingButton';
import AIConfigSettings from './AIConfigSettings';
import AIConfigChatArea from './AIConfigChatArea';
import AIConfigInput from './AIConfigInput';
import AIConfigChannelPreview from './AIConfigChannelPreview';
import { useAIConfigChat } from '../../hooks/useAIConfigChat';
import { useTranslation } from 'react-i18next';

const AIConfigWidget = () => {
  const [userState] = useContext(UserContext);
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const {
    messages,
    isLoading,
    extractedConfig,
    setExtractedConfig,
    sendMessage,
    clearMessages,
    stopGeneration,
  } = useAIConfigChat();

  if (!userState?.user || userState.user.role < 10) {
    return null;
  }

  return (
    <>
      <AIConfigFloatingButton
        onClick={() => setVisible(true)}
        visible={visible}
      />
      <SideSheet
        title={
          <div className="flex items-center gap-2">
            <span>{t('AI 配置助手')}</span>
            <Button
              icon={
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              }
              size="small"
              theme="borderless"
              onClick={() => setShowSettings((s) => !s)}
            />
          </div>
        }
        visible={visible}
        onCancel={() => setVisible(false)}
        width={420}
        placement="right"
        style={{ height: '100%' }}
        bodyStyle={{ padding: 0, display: 'flex', flexDirection: 'column', height: 'calc(100% - 56px)' }}
        footer={null}
        closeOnOutsideClick={false}
      >
        {showSettings && <AIConfigSettings />}
        <AIConfigChatArea messages={messages} isLoading={isLoading} />
        {extractedConfig && (
          <AIConfigChannelPreview
            config={extractedConfig}
            onConfigCreated={() => setExtractedConfig(null)}
          />
        )}
        <AIConfigInput
          onSend={sendMessage}
          isLoading={isLoading}
          onStop={stopGeneration}
          onClear={clearMessages}
        />
      </SideSheet>
    </>
  );
};

export default AIConfigWidget;
