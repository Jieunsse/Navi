import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** 영상 파일 저장소. S3 호환 API라 배포는 Cloudflare R2, 로컬은 S3 호환 서버(docker-compose.dev.yml)를 쓴다. */
export interface StoragePort {
  /** 잠깐만 쓸 수 있는 읽기 주소 */
  signedGetUrl(key: string, ttlSec: number): Promise<string>;
  /** 파일이 없어도 오류로 보지 않는다 */
  remove(key: string): Promise<void>;
}

export function storageConfig() {
  const endpoint = process.env.STORAGE_ENDPOINT ?? "http://localhost:9090";
  return {
    endpoint,
    // egress(도커 안)가 저장소를 부르는 주소. 로컬은 도커 안에서 보이는 이름이 달라서 따로 받는다.
    egressEndpoint: process.env.STORAGE_EGRESS_ENDPOINT ?? endpoint,
    region: process.env.STORAGE_REGION ?? "auto",
    bucket: process.env.STORAGE_BUCKET ?? "nabi-recordings",
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID ?? "nabi-dev",
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY ?? "nabi-dev-secret",
  };
}

export function createStorage(): StoragePort {
  const cfg = storageConfig();
  const s3 = new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    forcePathStyle: true,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    // R2는 새 SDK의 기본 체크섬 헤더를 받지 못하는 경우가 있어 필요할 때만 붙인다.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return {
    signedGetUrl: (key, ttlSec) => getSignedUrl(s3, new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), { expiresIn: ttlSec }),
    async remove(key) {
      await s3.send(new DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

/** 확인용 가짜 저장소. 지운 키와 발급한 주소를 기억한다. */
export function createFakeStorage(): StoragePort & { removed: string[]; signed: { key: string; ttlSec: number }[] } {
  const removed: string[] = [];
  const signed: { key: string; ttlSec: number }[] = [];
  return {
    removed,
    signed,
    async signedGetUrl(key, ttlSec) {
      signed.push({ key, ttlSec });
      return `https://fake-storage.test/${key}?ttl=${ttlSec}`;
    },
    async remove(key) {
      removed.push(key);
    },
  };
}
