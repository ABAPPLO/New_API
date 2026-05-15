package controller

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type SmartFillRequest struct {
	Models []struct {
		Name string `json:"name"`
		Type string `json:"type"` // text, image, video, audio
	} `json:"models"`
	DefaultRatio float64 `json:"default_ratio"`
}

func BatchSmartFill(c *gin.Context) {
	var req SmartFillRequest
	req.DefaultRatio = 1.0
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "请求参数错误: " + err.Error(),
		})
		return
	}
	if req.DefaultRatio <= 0 {
		req.DefaultRatio = 1.0
	}

	// 1. Batch create model metadata
	createdModels := make([]string, 0)
	vendorMap := make(map[int]*model.Vendor)
	vendors, _ := model.GetAllVendors(0, 1000)
	for _, v := range vendors {
		vendorMap[v.Id] = v
	}

	for _, m := range req.Models {
		if m.Name == "" {
			continue
		}
		// Check if already exists
		exists, _ := model.IsModelNameDuplicated(0, m.Name)
		if exists {
			continue
		}

		// Auto-detect vendor
		vendorID := 0
		modelLower := strings.ToLower(m.Name)
		for pattern, vendorName := range model.DefaultVendorRules {
			if strings.Contains(modelLower, pattern) {
				vendorID = model.GetOrCreateVendorByName(vendorName, vendorMap)
				break
			}
		}

		// Determine tag from type
		tags := ""
		switch m.Type {
		case "image":
			tags = "图片生成"
		case "video":
			tags = "视频生成"
		case "audio":
			tags = "音频"
		default:
			tags = "文本生成"
		}

		newModel := &model.Model{
			ModelName:    m.Name,
			VendorID:     vendorID,
			Status:       1,
			SyncOfficial: 0,
			NameRule:     model.NameRuleExact,
			Tags:         tags,
		}
		if err := newModel.Insert(); err != nil {
			continue
		}
		createdModels = append(createdModels, m.Name)
	}

	// 2. Batch set pricing for all requested models
	currentRatio := ratio_setting.GetModelRatioCopy()
	currentPrice := ratio_setting.GetModelPriceCopy()
	pricingSet := make([]string, 0)

	for _, m := range req.Models {
		if m.Name == "" {
			continue
		}
		_, hasRatio := currentRatio[m.Name]
		_, hasPrice := currentPrice[m.Name]
		if hasRatio || hasPrice {
			continue
		}

		switch m.Type {
		case "image", "video":
			currentPrice[m.Name] = 0.04
		default: // text, audio
			currentRatio[m.Name] = req.DefaultRatio
		}
		pricingSet = append(pricingSet, m.Name)
	}

	// Persist ModelRatio
	if len(currentRatio) > 0 {
		jsonBytes, err := common.Marshal(currentRatio)
		if err == nil {
			jsonStr := string(jsonBytes)
			_ = model.UpdateOption("ModelRatio", jsonStr)
			_ = ratio_setting.UpdateModelRatioByJSONString(jsonStr)
		}
	}

	// Persist ModelPrice
	if len(currentPrice) > 0 {
		jsonBytes, err := common.Marshal(currentPrice)
		if err == nil {
			jsonStr := string(jsonBytes)
			_ = model.UpdateOption("ModelPrice", jsonStr)
			_ = ratio_setting.UpdateModelPriceByJSONString(jsonStr)
		}
	}

	model.RefreshPricing()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf(
			"智能填充完成：创建 %d 个模型元数据，设置 %d 个模型定价",
			len(createdModels), len(pricingSet),
		),
		"data": gin.H{
			"created_models": createdModels,
			"pricing_set":    pricingSet,
		},
	})
}
