import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface LoopbackTlsCertificate {
  key: string;
  cert: string;
  /** 이 process의 TLS client 기본 CA를 원래대로 되돌린다. */
  restoreTrust(): void;
}

/**
 * `127.0.0.1` 전용 self-signed 인증서를 실행 중에 만들고 이 process의 TLS client가 신뢰하게 한다.
 *
 * HTTPS만 허용하는 outbound 경계를 실제 TLS로 검증하기 위한 test 전용 helper다.
 * key는 OS 임시 디렉터리에만 잠시 쓰고 지우며, 인증서 검증을 끄는 전역 설정은 사용하지 않는다.
 */
export async function trustLoopbackTlsCertificate(): Promise<LoopbackTlsCertificate> {
  const directory = await mkdtemp(join(tmpdir(), 'teamspace-loopback-tls-'));
  const keyPath = join(directory, 'key.pem');
  const certPath = join(directory, 'cert.pem');
  try {
    await execFileAsync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'ec',
      '-pkeyopt',
      'ec_paramgen_curve:prime256v1',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=127.0.0.1',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-keyout',
      keyPath,
      '-out',
      certPath,
    ]);
    const [key, cert] = await Promise.all([
      readFile(keyPath, 'utf8'),
      readFile(certPath, 'utf8'),
    ]);

    const previous = getCACertificates('default');
    setDefaultCACertificates([...previous, cert]);
    return {
      key,
      cert,
      restoreTrust: () => setDefaultCACertificates(previous),
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
