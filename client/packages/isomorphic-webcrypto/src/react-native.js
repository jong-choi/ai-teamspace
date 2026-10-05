import { getRandomValues } from 'expo-crypto';

const subtle = new Proxy(
  {},
  {
    get(_target, operation) {
      return () =>
        Promise.reject(
          new Error(
            `현재 Work OS React Native WebCrypto adapter는 ${String(operation)} 연산을 지원하지 않습니다.`,
          ),
        );
    },
  },
);

module.exports = {
  ensureSecure: () => Promise.resolve(true),
  getRandomValues,
  subtle,
};
