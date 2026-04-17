package system_setting

import "github.com/QuantumNous/new-api/setting/config"

type S3StorageSetting struct {
	Enabled      bool   `json:"enabled"`
	Endpoint     string `json:"endpoint"`
	Region       string `json:"region"`
	Bucket       string `json:"bucket"`
	AccessKey    string `json:"access_key"`
	SecretKey    string `json:"secret_key"`
	PathPrefix   string `json:"path_prefix"`
	UsePathStyle bool   `json:"use_path_style"`
	PublicURL    string `json:"public_url"`
}

var defaultS3StorageSetting = S3StorageSetting{
	Enabled:      false,
	Region:       "us-east-1",
	PathPrefix:   "generated/",
	UsePathStyle: false,
}

func init() {
	config.GlobalConfig.Register("s3_storage", &defaultS3StorageSetting)
}

func GetS3StorageSetting() *S3StorageSetting {
	return &defaultS3StorageSetting
}
