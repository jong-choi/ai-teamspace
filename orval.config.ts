import { defineConfig } from 'orval';

export default defineConfig({
  workOs: {
    input: process.env.OPENAPI_URL ?? './server/dist/openapi.json',
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
        mutator: {
          path: './client/packages/api-client/src/runtime.ts',
          name: 'workOsFetcher',
        },
        requestOptions: { credentials: 'include' },
      },
    },
  },
});
