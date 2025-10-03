import { S3Client } from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { loadConfig } from "../config";

const config = loadConfig();

const region =
  config.AWS_DEFAULT_REGION ??
  (() => {
    throw new Error("AWS_DEFAULT_REGION is required");
  })();

const accessKeyId =
  config.AWS_ACCESS_KEY_ID ??
  (() => {
    throw new Error("AWS_ACCESS_KEY_ID is required");
  })();

const secretAccessKey =
  config.AWS_SECRET_ACCESS_KEY ??
  (() => {
    throw new Error("AWS_SECRET_ACCESS_KEY is required");
  })();

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
