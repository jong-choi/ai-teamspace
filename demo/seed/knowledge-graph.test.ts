import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  type KnowledgeGraphSeedTarget,
  validateKnowledgeGraphSeed,
} from '#seed/seed-knowledge-graph.ts';
import {
  readKnowledgeGraphSeed,
  readUsers,
  readWorkspace,
} from '#seed/source.ts';

describe('knowledge graph seed', () => {
  it('모든 위키 문서의 추출과 768차원 임베딩이 서로 맞는다', async () => {
    const users = await readUsers();
    const [graph, workspaces] = await Promise.all([
      readKnowledgeGraphSeed(),
      Promise.all(
        users.organizations.map((organization) =>
          readWorkspace(organization.slug),
        ),
      ),
    ]);
    const targets: KnowledgeGraphSeedTarget[] = workspaces.flatMap(
      (workspace, workspaceIndex) =>
        workspace.wiki.documents.map((document, documentIndex) => ({
          documentId: `${workspaceIndex}-${documentIndex}`,
          documentKey: document.key,
          organizationId: String(workspaceIndex),
          organizationSlug: workspace.slug,
        })),
    );

    validateKnowledgeGraphSeed(graph, targets);
    assert.equal(targets.length, 19);
    assert.equal(
      graph.extractions.reduce((sum, row) => sum + row.nodes.length, 0),
      174,
    );
    assert.equal(
      graph.extractions.reduce((sum, row) => sum + row.relationships.length, 0),
      152,
    );
    assert.ok(graph.embeddings.every((row) => row.vector.length === 768));

    for (const workspace of workspaces) {
      for (const document of workspace.wiki.documents) {
        const embedding = graph.embeddings.find(
          (row) =>
            row.organization === workspace.slug &&
            row.document === document.key,
        );
        assert.ok(embedding);
        assert.equal(
          embedding.text,
          workspace.wikiMarkdown
            .get(document.file)
            ?.normalize('NFC')
            .replace(/\r\n?/g, '\n')
            .trimEnd(),
        );
      }
    }
  });
});
