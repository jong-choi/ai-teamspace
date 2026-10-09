import { Injectable } from '@nestjs/common';

import { SemanticProviderError } from '@/knowledge-graph/domain/semantic-error';
import { semanticEmbeddingText } from '@/knowledge-graph/domain/semantic-generation';
import { semanticChunker } from '@/knowledge-graph/domain/semantic-pipeline';
import { normalizeSemanticText } from '@/knowledge-graph/domain/semantic-source-signature';
import { SemanticChunkerProvider } from '@/knowledge-graph/infrastructure/chunking/semantic-chunker.provider';
import type { WikiSemanticSource } from '@/wiki/domain/wiki-semantic-source';

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

@Injectable()
export class MarkdownSemanticChunkerAdapter extends SemanticChunkerProvider {
  private readonly splitter = RecursiveCharacterTextSplitter.fromLanguage(
    'markdown',
    {
      chunkSize: semanticChunker.chunkSize,
      chunkOverlap: semanticChunker.chunkOverlap,
    },
  );
  async chunks(source: WikiSemanticSource) {
    const text = normalizeSemanticText(source.contentMarkdown);
    if (text.length + source.title.length > semanticChunker.maxChars)
      throw new SemanticProviderError('SEMANTIC_SOURCE_TOO_LARGE');
    if (!text.trim()) return [];
    const chunks = await this.splitter.splitText(text);
    if (chunks.length > semanticChunker.maxChunks)
      throw new SemanticProviderError('SEMANTIC_SOURCE_TOO_LARGE');
    for (const chunk of chunks) semanticEmbeddingText(source.title, chunk);
    return chunks;
  }
}
