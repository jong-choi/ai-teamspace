import { defineConfig } from 'orval';

export default defineConfig({
  workOs: {
    input: process.env.OPENAPI_URL ?? 'http://127.0.0.1:3000/openapi.json',
    output: {
      target: './client/packages/api-client/src/generated/work-os.ts',
      packageJson: './client/packages/api-client/package.json',
      client: 'react-query',
      httpClient: 'fetch',
      override: {
        fetch: {
          includeHttpResponseReturnType: true,
          forceSuccessResponse: true,
        },
        requestOptions: { credentials: 'include' },
      },
    },
  },
});
