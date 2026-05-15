package controller

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

type BatchImportPricingRequest struct {
	DefaultRatio float64 `json:"default_ratio"`
}

func BatchImportPricing(c *gin.Context) {
	req := BatchImportPricingRequest{DefaultRatio: 1.0}
	if c.Request.Body != nil && c.Request.ContentLength > 0 {
		_ = common.DecodeJson(c.Request.Body, &req)
	}
	if req.DefaultRatio <= 0 {
		req.DefaultRatio = 1.0
	}

	enabledModels := model.GetEnabledModels()
	currentRatio := ratio_setting.GetModelRatioCopy()
	currentPrice := ratio_setting.GetModelPriceCopy()

	importedModels := make([]string, 0)
	for _, modelName := range enabledModels {
		_, hasRatio := currentRatio[modelName]
		_, hasPrice := currentPrice[modelName]
		if !hasRatio && !hasPrice {
			currentRatio[modelName] = req.DefaultRatio
			importedModels = append(importedModels, modelName)
		}
	}

	if len(importedModels) == 0 {
		c.JSON(http.StatusOK, gin.H{
			"success": true,
			"message": "没有需要导入的模型",
			"data": gin.H{
				"imported_count":  0,
				"imported_models": []string{},
			},
		})
		return
	}

	jsonBytes, err := common.Marshal(currentRatio)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "序列化失败: " + err.Error(),
		})
		return
	}
	jsonStr := string(jsonBytes)

	err = model.UpdateOption("ModelRatio", jsonStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "保存到数据库失败: " + err.Error(),
		})
		return
	}

	err = ratio_setting.UpdateModelRatioByJSONString(jsonStr)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"success": false,
			"message": "更新运行时倍率失败: " + err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": fmt.Sprintf("批量导入成功，共导入 %d 个模型", len(importedModels)),
		"data": gin.H{
			"imported_count":  len(importedModels),
			"imported_models": importedModels,
		},
	})
}
