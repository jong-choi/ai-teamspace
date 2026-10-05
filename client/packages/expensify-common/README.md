# expensify-common compatibility package

`@expensify/react-native-live-markdown`이 `expensify-common`을 peer dependency로 요구하지만, Work OS Wiki는 package root가 아니라 `MarkdownTextInput`만 deep import하고 자체 Markdown parser를 사용한다.

이 workspace package는 npm peer dependency 해석 때문에 오래된 `expensify-common` 의존성 트리와 별도 React 버전이 설치되는 것을 막기 위한 최소 compatibility package다. Wiki가 live-markdown의 `ExpensiMark` parser를 사용하게 되면 이 shim을 확장하지 말고 실제 `expensify-common` 도입 여부를 다시 검토해야 한다.
