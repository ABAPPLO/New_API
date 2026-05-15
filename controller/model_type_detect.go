package controller

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/types"
	"github.com/samber/lo"
	"github.com/tidwall/gjson"

	"github.com/gin-gonic/gin"
)

type SmartDetectRequest struct {
	ModelNames []string `json:"model_names"`
	LLMModel   string   `json:"llm_model"`
}

func SmartDetectModelTypes(c *gin.Context) {
	var req SmartDetectRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求参数错误: " + err.Error(),
		})
		return
	}

	if len(req.ModelNames) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "模型列表不能为空",
		})
		return
	}

	if req.LLMModel == "" {
		req.LLMModel = "gpt-4o-mini"
	}

	// Get admin user's group for channel lookup
	userId := c.GetInt("id")
	if userId == 0 {
		userId = 1
	}
	group, _ := model.GetUserGroup(userId, false)

	// Find a channel that serves the requested LLM model
	channel, err := model.GetRandomSatisfiedChannel(group, req.LLMModel, 0)
	if err != nil || channel == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": fmt.Sprintf("找不到支持模型 %s 的可用渠道", req.LLMModel),
		})
		return
	}

	// Build the classification prompt
	modelList := strings.Join(req.ModelNames, "\n- ")
	prompt := fmt.Sprintf(`你是一个 AI 模型分类专家。请根据以下模型名称，判断每个模型的主要输出类型。

输出类型只有四种：text（文本对话）、image（图片生成）、video（视频生成）、audio（语音/音频）

请严格按以下 JSON 格式返回，不要添加 markdown 代码块标记或其他内容：
{"模型名1": "text", "模型名2": "image", ...}

模型列表：
- %s`, modelList)

	// Build chat request (non-streaming)
	chatReq := &dto.GeneralOpenAIRequest{
		Model:  req.LLMModel,
		Stream: lo.ToPtr(false),
		Messages: []dto.Message{
			{
				Role:    "user",
				Content: prompt,
			},
		},
		MaxTokens: lo.ToPtr(uint(2048)),
	}

	// Create fake gin context for relay
	w := httptest.NewRecorder()
	fakeCtx, _ := gin.CreateTestContext(w)
	fakeCtx.Request = &http.Request{
		Method: "POST",
		URL:    &url.URL{Path: "/v1/chat/completions"},
		Header: make(http.Header),
	}
	fakeCtx.Request.Header.Set("Content-Type", "application/json")

	cache, _ := model.GetUserCache(userId)
	cache.WriteContext(fakeCtx)
	fakeCtx.Set("id", userId)
	fakeCtx.Set("channel", channel.Type)
	fakeCtx.Set("base_url", channel.GetBaseURL())
	fakeCtx.Set("group", group)

	newAPIError := middleware.SetupContextForSelectedChannel(fakeCtx, channel, req.LLMModel)
	if newAPIError != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "渠道配置失败: " + newAPIError.Error(),
		})
		return
	}

	info, err := relaycommon.GenRelayInfo(fakeCtx, types.RelayFormatOpenAI, chatReq, nil)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "生成请求信息失败: " + err.Error(),
		})
		return
	}

	info.IsChannelTest = true
	info.InitChannelMeta(fakeCtx)

	err = helper.ModelMappedHelper(fakeCtx, info, chatReq)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "模型映射失败: " + err.Error(),
		})
		return
	}

	chatReq.Model = info.UpstreamModelName

	apiType, _ := common.ChannelType2APIType(channel.Type)
	adaptor := relay.GetAdaptor(apiType)
	if adaptor == nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "不支持的渠道类型",
		})
		return
	}

	adaptor.Init(info)

	convertedRequest, err := adaptor.ConvertOpenAIRequest(fakeCtx, info, chatReq)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求转换失败: " + err.Error(),
		})
		return
	}

	jsonData, err := common.Marshal(convertedRequest)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "序列化请求失败: " + err.Error(),
		})
		return
	}

	requestBody := bytes.NewBuffer(jsonData)
	fakeCtx.Request.Body = io.NopCloser(bytes.NewBuffer(jsonData))

	resp, err := adaptor.DoRequest(fakeCtx, info, requestBody)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求上游失败: " + err.Error(),
		})
		return
	}

	httpResp, ok := resp.(*http.Response)
	if !ok || httpResp.StatusCode != http.StatusOK {
		msg := "上游返回错误"
		if httpResp != nil {
			msg = fmt.Sprintf("上游返回状态码 %d", httpResp.StatusCode)
		}
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": msg,
		})
		return
	}

	// Read response body
	_, respErr := adaptor.DoResponse(fakeCtx, httpResp, info)
	if respErr != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "解析响应失败: " + respErr.Error(),
		})
		return
	}

	// Extract the content from the recorded response
	result := w.Result()
	bodyBytes, _ := io.ReadAll(result.Body)
	_ = result.Body.Close()

	// Parse OpenAI response to get content
	content := gjson.GetBytes(bodyBytes, "choices.0.message.content").String()
	if content == "" {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "LLM 未返回有效内容",
		})
		return
	}

	// Clean up markdown code blocks if present
	content = strings.TrimSpace(content)
	content = strings.TrimPrefix(content, "```json")
	content = strings.TrimPrefix(content, "```")
	content = strings.TrimSuffix(content, "```")
	content = strings.TrimSpace(content)

	// Parse the JSON response into a map
	var typeMap map[string]string
	if err := common.Unmarshal([]byte(content), &typeMap); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "解析 LLM 返回结果失败: " + err.Error(),
			"raw":     content,
		})
		return
	}

	// Validate and normalize types
	validTypes := map[string]bool{"text": true, "image": true, "video": true, "audio": true}
	for k, v := range typeMap {
		if !validTypes[v] {
			typeMap[k] = "text"
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success":  true,
		"message":  fmt.Sprintf("智能识别完成，共识别 %d 个模型", len(typeMap)),
		"type_map": typeMap,
	})
}
