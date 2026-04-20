package controller

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/gin-gonic/gin"
	"golang.org/x/net/html"
)

type fetchURLRequest struct {
	URL string `json:"url" binding:"required"`
}

type fetchURLResponse struct {
	Title   string `json:"title"`
	Content string `json:"content"`
	URL     string `json:"url"`
}

func FetchURL(c *gin.Context) {
	var req fetchURLRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		common.ApiError(c, fmt.Errorf("invalid request: %v", err))
		return
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(req.URL, fetchSetting.EnableSSRFProtection, fetchSetting.AllowPrivateIp, fetchSetting.DomainFilterMode, fetchSetting.IpFilterMode, fetchSetting.DomainList, fetchSetting.IpList, fetchSetting.AllowedPorts, fetchSetting.ApplyIPFilterForDomain); err != nil {
		common.ApiError(c, fmt.Errorf("URL not allowed: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodGet, req.URL, nil)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to create request: %v", err))
		return
	}
	reqHTTP.Header.Set("User-Agent", "Mozilla/5.0 (compatible; NewAPI-Bot/1.0)")

	client := service.GetHttpClient()
	resp, err := client.Do(reqHTTP)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to fetch URL: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		common.ApiError(c, fmt.Errorf("upstream returned status %d", resp.StatusCode))
		return
	}

	// 5MB limit
	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to read response: %v", err))
		return
	}

	title, content := extractTextFromHTML(body)
	common.ApiSuccess(c, &fetchURLResponse{
		Title:   title,
		Content: content,
		URL:     req.URL,
	})
}

func extractTextFromHTML(data []byte) (string, string) {
	doc, err := html.Parse(strings.NewReader(string(data)))
	if err != nil {
		return "", string(data)
	}

	var title string
	var bodyText strings.Builder
	var skipTags = map[string]bool{
		"script": true, "style": true, "nav": true,
		"header": true, "footer": true, "noscript": true,
	}

	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if skipTags[n.Data] {
				return
			}
			if n.Data == "title" && n.FirstChild != nil {
				title = n.FirstChild.Data
			}
		}
		if n.Type == html.TextNode {
			text := strings.TrimSpace(n.Data)
			if text != "" {
				if bodyText.Len() > 0 {
					bodyText.WriteString("\n")
				}
				bodyText.WriteString(text)
			}
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(doc)

	return title, bodyText.String()
}

// --- SSE Chat Proxy ---

type aiConfigChatRequest struct {
	Endpoint string                   `json:"endpoint" binding:"required"`
	APIKey   string                   `json:"api_key" binding:"required"`
	Model    string                   `json:"model" binding:"required"`
	Messages []aiConfigChatMessage    `json:"messages" binding:"required"`
}

type aiConfigChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

func AIConfigChat(c *gin.Context) {
	var req aiConfigChatRequest
	if err := common.UnmarshalBodyReusable(c, &req); err != nil {
		common.ApiError(c, fmt.Errorf("invalid request: %v", err))
		return
	}

	fetchSetting := system_setting.GetFetchSetting()
	if err := common.ValidateURLWithFetchSetting(req.Endpoint, fetchSetting.EnableSSRFProtection, fetchSetting.AllowPrivateIp, fetchSetting.DomainFilterMode, fetchSetting.IpFilterMode, fetchSetting.DomainList, fetchSetting.IpList, fetchSetting.AllowedPorts, fetchSetting.ApplyIPFilterForDomain); err != nil {
		common.ApiError(c, fmt.Errorf("endpoint not allowed: %v", err))
		return
	}

	// Build messages with system prompt prepended
	messages := make([]map[string]string, 0, len(req.Messages)+1)
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": aiConfigSystemPrompt,
	})
	for _, m := range req.Messages {
		messages = append(messages, map[string]string{
			"role":    m.Role,
			"content": m.Content,
		})
	}

	reqBody := map[string]any{
		"model":    req.Model,
		"messages": messages,
		"stream":   true,
	}
	bodyBytes, err := common.Marshal(reqBody)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to marshal request: %v", err))
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
	defer cancel()

	reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodPost, req.Endpoint, strings.NewReader(string(bodyBytes)))
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to create request: %v", err))
		return
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("Authorization", "Bearer "+req.APIKey)

	client := service.GetHttpClient()
	resp, err := client.Do(reqHTTP)
	if err != nil {
		common.ApiError(c, fmt.Errorf("failed to call AI endpoint: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		common.ApiError(c, fmt.Errorf("AI endpoint returned status %d: %s", resp.StatusCode, string(body)))
		return
	}

	helper.SetEventStreamHeaders(c)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}
		c.Render(-1, common.CustomEvent{Data: line + "\n"})
		_ = helper.FlushWriter(c)
	}

	c.Render(-1, common.CustomEvent{Data: "data: [DONE]\n\n"})
	_ = helper.FlushWriter(c)
}

// --- System Prompt ---

const aiConfigSystemPrompt = `You are a channel configuration assistant for a multi-model API gateway (New API). Your job is to analyze third-party AI provider documentation and generate channel configuration.

The platform supports the following channel types:
1: OpenAI - https://api.openai.com
2: Midjourney - https://oa.api2d.net
3: Azure OpenAI - (custom base_url required)
4: Ollama - http://localhost:11434
5: MidjourneyPlus - https://api.openai-sb.com
6: OpenAIMax - https://api.openaimax.com
7: OhMyGPT - https://api.ohmygpt.com
8: Custom - (user provides base_url)
9: AILS - https://api.caipacity.com
10: AIProxy - https://api.aiproxy.io
11: PaLM - (custom)
12: API2GPT - https://api.api2gpt.com
13: AIGC2D - https://api.aigc2d.com
14: Anthropic - https://api.anthropic.com
15: Baidu - https://aip.baidubce.com
16: Zhipu - https://open.bigmodel.cn
17: Ali (DashScope) - https://dashscope.aliyuncs.com
18: Xunfei - (custom)
19: 360 - https://api.360.cn
20: OpenRouter - https://openrouter.ai/api
21: AIProxyLibrary - https://api.aiproxy.io
22: FastGPT - https://fastgpt.run/api/openapi
23: Tencent - https://hunyuan.tencentcloudapi.com
24: Gemini - https://generativelanguage.googleapis.com
25: Moonshot - https://api.moonshot.cn
26: ZhipuV4 - https://open.bigmodel.cn
27: Perplexity - https://api.perplexity.ai
31: LingYiWanWu - https://api.lingyiwanwu.com
33: AWS Bedrock - (custom)
34: Cohere - https://api.cohere.ai
35: MiniMax - https://api.minimax.chat
36: SunoAPI - (custom)
37: Dify - https://api.dify.ai
38: Jina - https://api.jina.ai
39: Cloudflare - https://api.cloudflare.com
40: SiliconFlow - https://api.siliconflow.cn
41: VertexAI - (custom, requires region)
42: Mistral - https://api.mistral.ai
43: DeepSeek - https://api.deepseek.com
44: MokaAI - https://api.moka.ai
45: VolcEngine - https://ark.cn-beijing.volces.com
46: BaiduV2 - https://qianfan.baidubce.com
47: Xinference - (custom)
48: xAI - https://api.x.ai
49: Coze - https://api.coze.cn
50: Kling - https://api.klingai.com
51: Jimeng - https://visual.volcengineapi.com
52: Vidu - https://api.vidu.cn
53: Submodel - https://llm.submodel.ai
54: DoubaoVideo - https://ark.cn-beijing.volces.com
55: Sora - https://api.openai.com
56: Replicate - https://api.replicate.com
57: Codex - https://chatgpt.com

When given API documentation or provider information, analyze it and identify:
1. Which channel type matches this provider
2. The correct base_url
3. Supported model names
4. Key format hints (e.g., "sk-..." for OpenAI, "sk-ant-..." for Anthropic)

When you have enough information to configure a channel, you MUST include a JSON configuration in a fenced code block with language ` + "`json-channel-config`" + `:

` + "```" + `json-channel-config
{
  "channel_type": 1,
  "channel_type_name": "OpenAI",
  "name": "Suggested Channel Name",
  "base_url": "https://api.openai.com",
  "key_format": "sk-...",
  "models": ["gpt-4o", "gpt-4o-mini"],
  "group": "default",
  "confidence": "high",
  "notes": "Any additional setup notes"
}
` + "```" + `

Guidelines:
- If the documentation mentions a provider not in the list, use channel_type: 8 (Custom) and suggest the appropriate base_url
- Include ALL model names you can identify from the documentation
- For base_url, include the full API base URL without trailing slash
- If unsure about the channel type, set confidence to "low" and explain why
- If the user provides only a URL domain, try to infer the full API endpoint
- Always provide helpful explanations alongside the configuration
- If information is insufficient, ask the user for more details before generating config
- The ` + "`key_format`" + ` field should describe the key format (e.g. "sk-...", "sk-ant-...", "API key from provider console")
- Models list should be comma-separated full model IDs as they appear in the provider API`
