export interface MergeFailure {
  id: string;
  reason: string;
  status?: number;
}

export interface MergeMetadata {
  totalRequested: number;
  grid: {
    rows: number;
    columns: number;
  };
  tile: {
    width: number;
    height: number;
  };
  output: {
    width: number;
    height: number;
    format: 'png' | 'jpeg';
    contentType: string;
  };
  cached: string[];
  downloaded: string[];
  durationMs: number;
  failures: MergeFailure[];
}

export interface MergeResult {
  buffer: Buffer;
  contentType: string;
  metadata: MergeMetadata;
}

export const encodeMetadataHeader = (metadata: MergeMetadata): string =>
  Buffer.from(JSON.stringify(metadata)).toString('base64url');

export const decodeMetadataHeader = (value: string): MergeMetadata => {
  const json = Buffer.from(value, 'base64url').toString('utf8');
  return JSON.parse(json) as MergeMetadata;
};
