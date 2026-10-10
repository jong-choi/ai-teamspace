import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

import { createToolCallingGraphTransformer } from '@repo/knowledge-graph';
import knowledgeGraphConfig from '@/knowledge-graph/config/knowledge-graph.config';
import {
  SemanticLeaseLostError,
  SemanticProviderError,
} from '@/knowledge-graph/domain/semantic-error';
import {
  semanticOntology,
  semanticPipelineDescriptor,
} from '@/knowledge-graph/domain/semantic-pipeline';
import { SemanticGraphExtractor } from '@/knowledge-graph/infrastructure/extraction/semantic-graph-extractor.provider';
import { createClassifiedProviderFetch } from '@/knowledge-graph/infrastructure/provider-http/classified-provider-fetch';

import { Document } from '@langchain/core/documents';
import { ChatOllama } from '@langchain/ollama';

@Injectable()
export class OllamaCloudSemanticExtractorAdapter extends SemanticGraphExtractor {
  constructor(
    @Inject(knowledgeGraphConfig.KEY)
    private readonly config: ConfigType<typeof knowledgeGraphConfig>,
  ) {
    super();
  }

  async extract(text: string, chunkIndex: number, signal: AbortSignal) {
    if (signal.aborted) throw new SemanticLeaseLostError();
    const settings = this.config.semantic;
    if (!settings) throw new SemanticProviderError('PROVIDER_UNAUTHORIZED');
    const classifiedFetch = createClassifiedProviderFetch(90_000);
    // run 별 signal을 전달한다. 동시 chunk가 다른 run의 취소 신호를 공유하지 않는다.
    const llm = new ChatOllama({
      model: semanticPipelineDescriptor.extractor.model,
      baseUrl: settings.ollamaBaseUrl,
      headers: { Authorization: `Bearer ${settings.ollamaApiKey}` },
      temperature: semanticPipelineDescriptor.extractor.temperature,
      maxRetries: 0,
      fetch: (input, init) =>
        classifiedFetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, signal])
            : signal,
        }),
    });
    const transformer = createToolCallingGraphTransformer({
      llm,
      allowedNodes: [...semanticOntology.allowedNodes],
      allowedRelationships: [...semanticOntology.allowedRelationships],
      strictMode: true,
    });
    const [graph] = await transformer.convertToGraphDocuments([
      new Document({ pageContent: text, metadata: { chunkIndex } }),
    ]);
    if (signal.aborted) throw new SemanticLeaseLostError();
    if (!graph) throw new SemanticProviderError('EXTRACTION_INVALID_RESPONSE');
    return graph;
  }
}
