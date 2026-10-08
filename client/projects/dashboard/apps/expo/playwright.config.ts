import path from 'node:path';

import { defineConfig, devices } from '@playwright/test';

// Agent 채팅 패널 E2E 전용 설정이다. Chromium 하나, worker 하나, 병렬 실행 없음.
// 개발 서버와 분리된 API(3101)와 Expo web(8083)을 띄워 같은 site의 cookie로 로그인한다.
const webPort = Number(process.env.E2E_WEB_PORT ?? 8083);
const apiPort = Number(process.env.E2E_API_PORT ?? 3101);
const webURL = `http://localhost:${webPort}`;
const apiURL = `http://localhost:${apiPort}`;
const repoRoot = path.resolve(__dirname, '../../../../..');

export default defineConfig({
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: '../../../../../.temp/playwright/dashboard',
  reporter: [['list']],
  testDir: './e2e',
  timeout: 240_000,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  use: {
    baseURL: webURL,
    locale: 'ko-KR',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npx env-cmd --no-override -- node dist/main.js',
      cwd: '../../../../../server',
      env: {
        PORT: String(apiPort),
        BETTER_AUTH_URL: apiURL,
        APP_TRUSTED_ORIGINS: webURL,
        AGENT_MIGRATE_ON_STARTUP: 'false',
      },
      reuseExistingServer: true,
      timeout: 120_000,
      url: `${apiURL}/api/auth/ok`,
    },
    {
      command: `npx expo start --web --port ${webPort}`,
      // 개발 서버(8082)와 Metro transform cache를 공유하면 다른 API 주소가 inline된 bundle을 받는다.
      env: {
        CI: '1',
        EXPO_NO_DOTENV: '1',
        EXPO_PUBLIC_API_URL: apiURL,
        TMPDIR: `${repoRoot}/.temp/playwright/metro-tmp`,
      },
      reuseExistingServer: true,
      timeout: 240_000,
      url: webURL,
    },
  ],
});
