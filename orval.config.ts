import { defineConfig } from 'orval';

export default defineConfig({
  workOs: {
    input: process.env.OPENAPI_URL ?? './server/dist/openapi.json',
    output: {
      target: './client/packages/api-client/src/generated/work-os.ts',
      schemas: {
        path: './client/packages/api-client/src/generated/schemas',
        type: 'zod',
      },
      packageJson: './client/packages/api-client/package.json',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      override: {
        includeZodSchemaInArguments: true,
        fetch: {
          includeHttpResponseReturnType: false,
          forceSuccessResponse: true,
          runtimeValidation: true,
        },
        mutator: {
          path: './client/packages/api-client/src/runtime.ts',
          name: 'workOsFetcher',
        },
        query: {
          useQuery: false,
          useSuspenseQuery: true,
          signal: true,
        },
        operations: {
          ChatController_listMessages: {
            query: {
              useSuspenseQuery: false,
              useSuspenseInfiniteQuery: true,
              useInfiniteQueryParam: 'before',
            },
          },
          ChatController_events: {
            query: {
              useQuery: false,
              useSuspenseQuery: false,
              useInfinite: false,
              useSuspenseInfiniteQuery: false,
            },
          },
        },
        zod: {
          version: 4,
          variant: 'classic',
          generateReusableSchemas: true,
          generateDiscriminatedUnion: true,
          generateCompanionTypes: true,
        },
      },
    },
  },
});
