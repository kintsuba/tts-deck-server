import { S3Client } from '@aws-sdk/client-s3';
import type { S3ClientConfig } from '@aws-sdk/client-s3';
import { loadConfig } from '../config';

const config = loadConfig();

const clientConfig: S3ClientConfig = {
  region: config.AWS_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: config.AWS_ACCESS_KEY_ID,
    secretAccessKey: config.AWS_SECRET_ACCESS_KEY,
  },
};

if (config.AWS_ENDPOINT_URL) {
  clientConfig.endpoint = config.AWS_ENDPOINT_URL;
}

export const s3Client = new S3Client(clientConfig);
