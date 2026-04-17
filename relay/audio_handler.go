package relay

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func AudioHelper(c *gin.Context, info *relaycommon.RelayInfo) (newAPIError *types.NewAPIError) {
	info.InitChannelMeta(c)

	audioReq, ok := info.Request.(*dto.AudioRequest)
	if !ok {
		return types.NewError(errors.New("invalid request type"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	request, err := common.DeepCopy(audioReq)
	if err != nil {
		return types.NewError(fmt.Errorf("failed to copy request to AudioRequest: %w", err), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}

	err = helper.ModelMappedHelper(c, info, request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeChannelModelMappedError, types.ErrOptionWithSkipRetry())
	}

	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)

	ioReader, err := adaptor.ConvertAudioRequest(c, info, *request)
	if err != nil {
		return types.NewError(err, types.ErrorCodeConvertRequestFailed, types.ErrOptionWithSkipRetry())
	}

	resp, err := adaptor.DoRequest(c, info, ioReader)
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed)
	}
	statusCodeMappingStr := c.GetString("status_code_mapping")

	var httpResp *http.Response
	if resp != nil {
		httpResp = resp.(*http.Response)
		if httpResp.StatusCode != http.StatusOK {
			newAPIError = service.RelayErrorHandler(c.Request.Context(), httpResp, false)
			// reset status code 重置状态码
			service.ResetStatusCode(newAPIError, statusCodeMappingStr)
			return newAPIError
		}
	}

	var usage any
	if service.IsS3Enabled() {
		bufWriter := NewBufferResponseWriter(c.Writer)
		c.Writer = bufWriter

		usage, newAPIError = adaptor.DoResponse(c, httpResp, info)

		c.Writer = bufWriter.ResponseWriter

		if newAPIError != nil {
			service.ResetStatusCode(newAPIError, statusCodeMappingStr)
			return newAPIError
		}

		captured := bufWriter.GetData()
		contentType := bufWriter.GetContentType()
		statusCode := bufWriter.GetStatusCode()

		// Skip redirect responses (e.g. MiniMax 302)
		if statusCode >= 300 && statusCode < 400 {
			c.Writer.Write(captured)
		} else if len(captured) > 0 && !bytes.HasPrefix(bytes.TrimSpace(captured), []byte("{")) {
			// Binary audio data — upload to S3 and return URL
			audioFormat := "mp3"
			if audioReq, ok := info.Request.(*dto.AudioRequest); ok && audioReq.ResponseFormat != "" {
				audioFormat = audioReq.ResponseFormat
			}
			if contentType == "" {
				contentType = "audio/mpeg"
			}

			s3URL, err := service.UploadAudioToS3(c.Request.Context(), captured, audioFormat, contentType)
			if err == nil {
				jsonResp := map[string]string{
					"url":          s3URL,
					"content_type": contentType,
				}
				jsonData, _ := common.Marshal(jsonResp)
				c.Writer.Header().Set("Content-Type", "application/json")
				c.Writer.WriteHeader(http.StatusOK)
				c.Writer.Write(jsonData)
			} else {
				common.SysError(fmt.Sprintf("failed to upload audio to S3: %s", err.Error()))
				c.Writer.Write(captured)
			}
		} else {
			// JSON response (error or other) — pass through
			c.Writer.Write(captured)
		}
	} else {
		usage, newAPIError = adaptor.DoResponse(c, httpResp, info)
		if newAPIError != nil {
			service.ResetStatusCode(newAPIError, statusCodeMappingStr)
			return newAPIError
		}
	}
	if usage.(*dto.Usage).CompletionTokenDetails.AudioTokens > 0 || usage.(*dto.Usage).PromptTokensDetails.AudioTokens > 0 {
		service.PostAudioConsumeQuota(c, info, usage.(*dto.Usage), "")
	} else {
		service.PostTextConsumeQuota(c, info, usage.(*dto.Usage), nil)
	}

	return nil
}
