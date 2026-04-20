import { useState, useCallback, useRef } from 'react';
import { SSE } from 'sse.js';
import { API, getUserIdFromLocalStorage, showError } from '../helpers';

const STORAGE_KEY = 'ai_config_settings';

export function loadSettings() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {}
  return { endpoint: '', apiKey: '', model: '' };
}

export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useAIConfigChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [extractedConfig, setExtractedConfig] = useState(null);
  const sseSourceRef = useRef(null);

  const extractChannelConfig = useCallback((text) => {
    const regex = /```json-channel-config\s*\n([\s\S]*?)\n```/;
    const match = text.match(regex);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return null;
      }
    }
    return null;
  }, []);

  const sendMessage = useCallback(
    async (content, isUrl = false) => {
      const settings = loadSettings();
      if (!settings.endpoint || !settings.apiKey || !settings.model) {
        showError('请先配置AI设置（点击齿轮图标）');
        return;
      }

      let userContent = content;
      if (isUrl) {
        try {
          const res = await API.post('/api/ai_config/fetch_url', {
            url: content,
          });
          const { success, data, message } = res.data;
          if (!success) {
            showError(message || '获取文档失败');
            return;
          }
          userContent = `[Documentation from ${content}]\nTitle: ${data.title}\n\n${data.content}`;
        } catch (err) {
          showError('获取文档失败: ' + (err.message || ''));
          return;
        }
      }

      const userMsg = { role: 'user', content: userContent, id: Date.now() };
      const assistantMsg = {
        role: 'assistant',
        content: '',
        id: Date.now() + 1,
        loading: true,
      };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsLoading(true);

      // Build messages array for API (exclude loading placeholders)
      const apiMessages = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content }));

      const source = new SSE('/api/ai_config/chat', {
        headers: {
          'Content-Type': 'application/json',
          'New-Api-User': String(getUserIdFromLocalStorage()),
        },
        method: 'POST',
        payload: JSON.stringify({
          endpoint: settings.endpoint,
          api_key: settings.apiKey,
          model: settings.model,
          messages: apiMessages,
        }),
      });

      sseSourceRef.current = source;
      let fullContent = '';

      source.addEventListener('message', (e) => {
        if (e.data === '[DONE]') {
          source.close();
          sseSourceRef.current = null;
          setMessages((prev) => {
            const updated = [...prev];
            const lastIdx = updated.length - 1;
            if (updated[lastIdx]?.loading) {
              updated[lastIdx] = {
                ...updated[lastIdx],
                loading: false,
                content: fullContent,
              };
            }
            return updated;
          });
          setIsLoading(false);
          // Try to extract channel config
          const config = extractChannelConfig(fullContent);
          if (config) {
            setExtractedConfig(config);
          }
          return;
        }

        try {
          const payload = JSON.parse(e.data);
          const delta = payload.choices?.[0]?.delta;
          if (delta?.content) {
            fullContent += delta.content;
            setMessages((prev) => {
              const updated = [...prev];
              const lastIdx = updated.length - 1;
              if (updated[lastIdx]) {
                updated[lastIdx] = {
                  ...updated[lastIdx],
                  content: fullContent,
                };
              }
              return updated;
            });
          }
        } catch {
          // ignore parse errors for non-data lines
        }
      });

      source.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
        let errorMessage = '请求发生错误';
        if (e.data) {
          try {
            const errJson = JSON.parse(e.data);
            if (errJson?.error?.message) {
              errorMessage = errJson.error.message;
            } else if (errJson?.message) {
              errorMessage = errJson.message;
            }
          } catch {
            // use default message
          }
        }
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.loading) {
            updated[lastIdx] = {
              ...updated[lastIdx],
              loading: false,
              content: fullContent + '\n\n❌ ' + errorMessage,
            };
          }
          return updated;
        });
        setIsLoading(false);
        sseSourceRef.current = null;
        source.close();
      });
    },
    [messages, extractChannelConfig],
  );

  const clearMessages = useCallback(() => {
    setMessages([]);
    setExtractedConfig(null);
  }, []);

  const stopGeneration = useCallback(() => {
    if (sseSourceRef.current) {
      sseSourceRef.current.close();
      sseSourceRef.current = null;
    }
    setIsLoading(false);
    setMessages((prev) => {
      const updated = [...prev];
      const lastIdx = updated.length - 1;
      if (updated[lastIdx]?.loading) {
        updated[lastIdx] = { ...updated[lastIdx], loading: false };
      }
      return updated;
    });
  }, []);

  return {
    messages,
    isLoading,
    extractedConfig,
    setExtractedConfig,
    sendMessage,
    clearMessages,
    stopGeneration,
  };
}
