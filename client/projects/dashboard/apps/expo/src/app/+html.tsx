import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

const APP_NAME = 'Teamspace';
const APP_DESCRIPTION =
  '위키, 프로젝트, 일정, 대화를 AI와 함께 관리하는 팀 워크스페이스';

// Web 정적 렌더링에서만 쓰는 문서 최상위다. Node에서 실행되므로 DOM과 브라우저 API를 쓰지 않는다.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />
        <title>{APP_NAME}</title>
        <meta name="description" content={APP_DESCRIPTION} />
        <meta name="application-name" content={APP_NAME} />
        <meta name="apple-mobile-web-app-title" content={APP_NAME} />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={APP_NAME} />
        <meta property="og:title" content={APP_NAME} />
        <meta property="og:description" content={APP_DESCRIPTION} />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
