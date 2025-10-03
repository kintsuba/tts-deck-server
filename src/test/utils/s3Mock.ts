import {
  GetObjectCommand,
  PutObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { S3Client } from "@aws-sdk/client-s3";

const s3Mock = mockClient(S3Client);

interface KeyOptions {
  bucket?: string;
}

const commandMatcher = (key: string, options: KeyOptions = {}) => ({
  Key: key,
  ...(options.bucket ? { Bucket: options.bucket } : {}),
});

export const resetS3Mock = () => {
  s3Mock.reset();
};

export const mockCachedImage = (
  key: string,
  data: Buffer,
  contentType = "image/png",
  options: KeyOptions = {},
) => {
  s3Mock.on(GetObjectCommand, commandMatcher(key, options)).resolves({
    Body: data as never,
    ContentType: contentType,
  });
};

export const mockCachedImageMissing = (
  key: string,
  options: KeyOptions = {},
) => {
  s3Mock.on(GetObjectCommand, commandMatcher(key, options)).rejects({
    name: "NoSuchKey",
    $metadata: { httpStatusCode: 404 },
  });
};

export const getPutCommands = (): PutObjectCommandInput[] =>
  s3Mock
    .commandCalls(PutObjectCommand)
    .map((call) => call.args[0].input as PutObjectCommandInput);

export const getS3Mock = () => s3Mock;
