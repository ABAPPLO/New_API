package controller

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

type FetchRemoteChannelsRequest struct {
	BaseURL string `json:"base_url" binding:"required"`
	Token   string `json:"token" binding:"required"`
}

type ImportChannelsRequest struct {
	Channels []model.Channel `json:"channels" binding:"required"`
}

type FailedChannel struct {
	Name  string `json:"name"`
	Error string `json:"error"`
}

func FetchRemoteChannels(c *gin.Context) {
	req := FetchRemoteChannelsRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, fmt.Errorf("参数错误: %w", err))
		return
	}

	baseURL := strings.TrimRight(req.BaseURL, "/")
	fetchURL := baseURL + "/api/channel/?p=0&page_size=10000"

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, fetchURL, nil)
	if err != nil {
		common.ApiError(c, fmt.Errorf("创建请求失败: %w", err))
		return
	}
	httpReq.Header.Set("Authorization", "Bearer "+req.Token)
	httpReq.Header.Set("New-API-User", "1")
	httpReq.Header.Set("Content-Type", "application/json")

	client, err := service.NewProxyHttpClient("")
	if err != nil {
		common.ApiError(c, fmt.Errorf("创建HTTP客户端失败: %w", err))
		return
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		common.ApiError(c, fmt.Errorf("请求远程平台失败: %w", err))
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		common.ApiError(c, fmt.Errorf("读取响应失败: %w", err))
		return
	}

	if resp.StatusCode != http.StatusOK {
		common.ApiError(c, fmt.Errorf("远程平台返回错误 (HTTP %d): %s", resp.StatusCode, string(body)))
		return
	}

	var result struct {
		Success bool            `json:"success"`
		Message string          `json:"message"`
		Data    []model.Channel `json:"data"`
	}
	if err := common.Unmarshal(body, &result); err != nil {
		common.ApiError(c, fmt.Errorf("解析响应失败: %w", err))
		return
	}

	if !result.Success {
		common.ApiError(c, fmt.Errorf("远程平台返回错误: %s", result.Message))
		return
	}

	// Clean runtime fields, keep config + key
	for i := range result.Data {
		ch := &result.Data[i]
		ch.Id = 0
		ch.TestTime = 0
		ch.ResponseTime = 0
		ch.Balance = 0
		ch.BalanceUpdatedTime = 0
		ch.UsedQuota = 0
	}

	common.ApiSuccess(c, result.Data)
}

func ImportChannels(c *gin.Context) {
	req := ImportChannelsRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, fmt.Errorf("参数错误: %w", err))
		return
	}

	if len(req.Channels) == 0 {
		common.ApiError(c, fmt.Errorf("渠道列表不能为空"))
		return
	}

	if len(req.Channels) > 500 {
		common.ApiError(c, fmt.Errorf("单次导入不能超过500个渠道"))
		return
	}

	var succeeded int
	var failed []FailedChannel
	var toInsert []model.Channel

	for i := range req.Channels {
		ch := &req.Channels[i]
		ch.Id = 0
		ch.CreatedTime = common.GetTimestamp()
		ch.TestTime = 0
		ch.ResponseTime = 0
		ch.Balance = 0
		ch.BalanceUpdatedTime = 0
		ch.UsedQuota = 0
		ch.Status = common.ChannelStatusEnabled

		if err := validateChannel(ch, true); err != nil {
			failed = append(failed, FailedChannel{Name: ch.Name, Error: err.Error()})
			continue
		}

		toInsert = append(toInsert, *ch)
	}

	if len(toInsert) > 0 {
		if err := model.BatchInsertChannels(toInsert); err != nil {
			// If batch insert fails, report all prepared channels as failed
			for _, ch := range toInsert {
				failed = append(failed, FailedChannel{Name: ch.Name, Error: err.Error()})
			}
		} else {
			succeeded = len(toInsert)
		}
	}

	model.InitChannelCache()
	service.ResetProxyClientCache()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"succeeded": succeeded,
			"failed":    failed,
		},
	})
}
