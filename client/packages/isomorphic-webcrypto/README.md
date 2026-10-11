# isomorphic-webcrypto compatibility package

`lib0`의 React Native export는 `isomorphic-webcrypto/src/react-native`를 고정 경로로 import한다.
AI Teamspace의 Yjs/Hocuspocus 경로에서 필요한 기능은 secure random 생성뿐이므로, 구형 `isomorphic-webcrypto` 전체 의존성을 설치하지 않고 Expo SDK의 `expo-crypto.getRandomValues`만 제공한다.

`subtle`은 의도적으로 지원하지 않는다. 이후 Yjs/lib0 사용 경로가 WebCrypto `subtle` 연산을 요구하게 되면 이 shim을 확장하지 말고 실제 의존성 요구사항을 다시 검토해야 한다.
