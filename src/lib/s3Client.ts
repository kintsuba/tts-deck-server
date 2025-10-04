import { S3Client } from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { getRequiredConfigValue, loadConfig } from "../config";

const config = loadConfig();
const region = getRequiredConfigValue("AWS_DEFAULT_REGION", config);
const accessKeyId = getRequiredConfigValue("AWS_ACCESS_KEY_ID", config);
const secretAccessKey = getRequiredConfigValue("AWS_SECRET_ACCESS_KEY", config);

const clientConfig: S3ClientConfig = {
  region,
  forcePathStyle: true,
  credentials: {
    accessKeyId,
    secretAccessKey,
  },
};

if (config.AWS_ENDPOINT_URL) {
  clientConfig.endpoint = config.AWS_ENDPOINT_URL;
}

export const s3Client = new S3Client(clientConfig);
