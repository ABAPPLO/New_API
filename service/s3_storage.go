package service

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/setting/system_setting"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/google/uuid"
)

var (
	s3Client     *s3.Client
	s3ClientMu   sync.Mutex
	s3ConfigHash string
)

func IsS3Enabled() bool {
	s := system_setting.GetS3StorageSetting()
	return s.Enabled && s.Endpoint != "" && s.Bucket != "" && s.AccessKey != "" && s.SecretKey != ""
}

func getS3Client() (*s3.Client, error) {
	cfg := system_setting.GetS3StorageSetting()
	newHash := fmt.Sprintf("%s|%s|%s|%t", cfg.Endpoint, cfg.Region, cfg.Bucket, cfg.UsePathStyle)

	s3ClientMu.Lock()
	defer s3ClientMu.Unlock()

	if s3Client != nil && s3ConfigHash == newHash {
		return s3Client, nil
	}

	opts := []func(*awsconfig.LoadOptions) error{
		awsconfig.WithRegion(cfg.Region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			cfg.AccessKey, cfg.SecretKey, "",
		)),
	}

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), opts...)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		if cfg.Endpoint != "" {
			o.BaseEndpoint = aws.String(cfg.Endpoint)
		}
		if cfg.UsePathStyle {
			o.UsePathStyle = true
		}
	})

	s3Client = client
	s3ConfigHash = newHash
	return client, nil
}

func UploadToS3(ctx context.Context, data []byte, key string, contentType string) (string, error) {
	client, err := getS3Client()
	if err != nil {
		return "", fmt.Errorf("failed to get S3 client: %w", err)
	}

	cfg := system_setting.GetS3StorageSetting()

	_, err = client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:      aws.String(cfg.Bucket),
		Key:         aws.String(key),
		Body:        bytes.NewReader(data),
		ContentType: aws.String(contentType),
	})
	if err != nil {
		return "", fmt.Errorf("failed to upload to S3: %w", err)
	}

	return getPublicURL(cfg, key), nil
}

func getPublicURL(cfg *system_setting.S3StorageSetting, key string) string {
	if cfg.PublicURL != "" {
		return fmt.Sprintf("%s/%s", strings.TrimRight(cfg.PublicURL, "/"), key)
	}

	if cfg.UsePathStyle {
		return fmt.Sprintf("%s/%s/%s", strings.TrimRight(cfg.Endpoint, "/"), cfg.Bucket, key)
	}

	bucketDomain := fmt.Sprintf("%s.s3.%s.amazonaws.com", cfg.Bucket, cfg.Region)
	return fmt.Sprintf("https://%s/%s", bucketDomain, key)
}

func generateObjectKey(mediaType, ext string) string {
	cfg := system_setting.GetS3StorageSetting()
	now := time.Now()
	prefix := strings.TrimRight(cfg.PathPrefix, "/")
	return fmt.Sprintf("%s/%s/%04d/%02d/%02d/%s.%s",
		prefix, mediaType,
		now.Year(), now.Month(), now.Day(),
		uuid.New().String(), ext,
	)
}

func ProcessImageResponse(imageResp *dto.ImageResponse) error {
	if !IsS3Enabled() {
		return nil
	}
	for i := range imageResp.Data {
		item := &imageResp.Data[i]
		if item.B64Json != "" && item.Url == "" {
			b64Data := item.B64Json
			if idx := strings.Index(b64Data, ","); idx != -1 {
				b64Data = b64Data[idx+1:]
			}

			decoded, err := base64.StdEncoding.DecodeString(b64Data)
			if err != nil {
				common.SysError(fmt.Sprintf("failed to decode base64 image: %s", err.Error()))
				continue
			}

			ext := detectImageExt(decoded)
			contentType := "image/" + ext
			key := generateObjectKey("images", ext)

			url, err := UploadToS3(context.Background(), decoded, key, contentType)
			if err != nil {
				common.SysError(fmt.Sprintf("failed to upload image to S3: %s", err.Error()))
				continue
			}

			item.Url = url
			item.B64Json = ""
		}
	}
	return nil
}

func UploadAudioToS3(ctx context.Context, data []byte, format string, contentType string) (string, error) {
	key := generateObjectKey("audio", format)
	return UploadToS3(ctx, data, key, contentType)
}

func detectImageExt(data []byte) string {
	mimeType := http.DetectContentType(data)
	switch mimeType {
	case "image/png":
		return "png"
	case "image/jpeg":
		return "jpg"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	case "image/bmp":
		return "bmp"
	default:
		return "png"
	}
}
