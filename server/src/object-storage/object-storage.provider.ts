export type StoredObject = {
  body: Uint8Array;
  contentType: string;
};

// S3 호환 object storage port다. key는 bucket 안의 경로다.
export abstract class ObjectStorageProvider {
  abstract put(key: string, object: StoredObject): Promise<void>;

  abstract get(key: string): Promise<StoredObject | null>;

  abstract delete(key: string): Promise<void>;
}
