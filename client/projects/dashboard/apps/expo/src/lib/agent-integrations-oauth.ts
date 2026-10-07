import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';

export async function openAgentMcpAuthorization(
  authorizationUrl: string,
): Promise<void> {
  const authorization = parseBrowserUrl(authorizationUrl);
  const rawCallback = authorization.searchParams.get('redirect_uri');
  const callback = rawCallback ? parseBrowserUrl(rawCallback) : null;

  if (Platform.OS === 'web' && callback) {
    await WebBrowser.openAuthSessionAsync(
      authorization.toString(),
      callback.toString(),
    );
    return;
  }

  await WebBrowser.openBrowserAsync(authorization.toString());
}

function parseBrowserUrl(value: string): URL {
  const url = new URL(value);
  const loopback =
    url.hostname === 'localhost' ||
    url.hostname === '127.0.0.1' ||
    url.hostname === '[::1]';

  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('OAuth 브라우저 URL은 HTTPS여야 합니다.');
  }
  if (url.username || url.password) {
    throw new Error('OAuth 브라우저 URL에 credential을 포함할 수 없습니다.');
  }
  return url;
}
