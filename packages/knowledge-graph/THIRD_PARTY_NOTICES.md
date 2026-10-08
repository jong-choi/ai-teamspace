# Third-party notices

## LangChain JS Community — LLMGraphTransformer 및 GraphDocument 모델

- Original repository: https://github.com/langchain-ai/langchainjs-community
- Original commit: `7eddd3c9a0850cdb2f0561a2485c071646b175c8`
- Original files:
  - `libs/community/src/experimental/graph_transformers/llm.ts`
  - `libs/community/src/graphs/document.ts` (필요 모델은 복사하지 않고 `@langchain/neo4j`의 공식 공개 export를 사용)
- Adaptation: NodeNext ESM import 별칭, `Node`/`Relationship`/`GraphDocument`의 `@langchain/neo4j` 공식 export 사용, 프로젝트 타입/ESLint/Prettier/한글 주석 규칙으로 변경. 추출 프롬프트와 데이터 필터링 의미는 유지.

MIT License

Copyright (c) LangChain, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
