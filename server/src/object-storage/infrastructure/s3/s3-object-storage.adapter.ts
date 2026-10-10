import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AllConfigType } from '@/config/config.type';
import {
  ObjectStorageProvider,
  type StoredObject,
} from '@/object-storage/object-storage.provider';

import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

@Injectable()
export class S3ObjectStorageAdapter
  extends ObjectStorageProvider
  implements OnModuleDestroy
{
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(configService: ConfigService<AllConfigType>) {
    super();
    const config = configService.getOrThrow('objectStorage', { infer: true });
    this.bucket = config.bucket;
    this.client = new S3Client({
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: config.endpoint,
      // Garage 같은 자체 호스팅 S3는 bucket을 host가 아니라 path로 지정한다.
      forcePathStyle: true,
      region: config.region,
    });
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }

  async put(key: string, object: StoredObject): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Body: object.body,
        Bucket: this.bucket,
        ContentType: object.contentType,
        Key: key,
      }),
    );
  }

  async get(key: string): Promise<StoredObject | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body) return null;
      return {
        body: await response.Body.transformToByteArray(),
        contentType: response.ContentType ?? DEFAULT_CONTENT_TYPE,
      };
    } catch (error) {
      if (error instanceof NoSuchKey) return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }
}
