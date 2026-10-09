import {
  SEMANTIC_AUTO_JOB,
  SemanticJobDataSchema,
} from '@/jobs/knowledge-graph/knowledge-graph-semantic.job';
import { describeKnowledgeGraph } from '@/knowledge-graph/testing/knowledge-graph-test-environment';
import { createSemanticFlowContext } from '@/knowledge-graph/testing/semantic-flow.context';
import { OutboxSemanticSourceState } from '@/outbox/outbox-semantic-source-state';

import { waitForCondition } from '@test/agent/support/workos-agent.e2e-support';
import * as Y from 'yjs';

jest.setTimeout(60_000);

describeKnowledgeGraph(
  'Wiki 실제 owner 변경의 자동 quiet 신호와 부모 문맥',
  () => {
    const context = createSemanticFlowContext();
    async function delayed(sourceId: string, version: number) {
      const state = context.app.get(OutboxSemanticSourceState);
      await waitForCondition(
        async () =>
          (
            await state.current({
              organizationId: context.org,
              aggregateKind: 'wiki_document',
              aggregateId: sourceId,
            })
          )?.state?.observedSeq === version,
        '최신 owner commit 관측이 없습니다.',
      );
      await waitForCondition(
        async () =>
          (await context.queue.getJobs(['delayed'])).some((job) => {
            const parsed = SemanticJobDataSchema.safeParse(job.data);
            return (
              job.name === SEMANTIC_AUTO_JOB &&
              parsed.success &&
              parsed.data.aggregateId === sourceId
            );
          }),
        '자동 delayed 작업이 없습니다.',
      );
      const jobs = (await context.queue.getJobs(['delayed'])).filter((job) => {
        const parsed = SemanticJobDataSchema.safeParse(job.data);
        return (
          job.name === SEMANTIC_AUTO_JOB &&
          parsed.success &&
          parsed.data.aggregateId === sourceId
        );
      });
      expect(jobs).toHaveLength(1);
      return jobs[0];
    }

    it('F7-01 create·title·parent·position·본문은 자동 예약하고 state-only·checkpoint-only는 seq와 due를 보존한다', async () => {
      const parent = await context.createWiki('자동 부모', '');
      const child = await context.createWiki('자동 자식', '처음 본문');
      const first = await delayed(child.id, 1);
      expect(first.opts.delay).toBeGreaterThan(290_000);
      await context.wiki.updateDocumentMetadata(
        context.org,
        child.id,
        context.actor,
        { title: '제목 변경', parentDocumentId: null, position: 0 },
      );
      const title = await delayed(child.id, 2);
      expect(title.timestamp + title.delay).toBeGreaterThanOrEqual(
        first.timestamp + first.delay,
      );
      await context.wiki.updateDocumentMetadata(
        context.org,
        child.id,
        context.actor,
        { title: '제목 변경', parentDocumentId: parent.id, position: 0 },
      );
      await delayed(child.id, 3);
      await context.wiki.updateDocumentMetadata(
        context.org,
        child.id,
        context.actor,
        { title: '제목 변경', parentDocumentId: parent.id, position: 4 },
      );
      await delayed(child.id, 4);
      const loaded = await context.wiki.loadCollaborationState(
        context.org,
        child.id,
      );
      if (!loaded) throw new Error('공동편집 원본이 없습니다.');
      const doc = new Y.Doc();
      try {
        Y.applyUpdate(doc, loaded.collaborationState);
        doc.getText('markdown').delete(0, doc.getText('markdown').length);
        doc.getText('markdown').insert(0, '최신 자동 본문');
        const changed = await context.wiki.persistCollaborationSnapshot(
          context.org,
          child.id,
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: doc.getText('markdown').toString(),
          },
          context.actor,
          [context.actor],
          1,
          false,
        );
        const body = await delayed(child.id, 5);
        const before = await context.wiki.findDocumentById(
          context.org,
          child.id,
        );
        doc.getMap('상태검증').set('metadata-only', true);
        await context.wiki.persistCollaborationSnapshot(
          context.org,
          child.id,
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: changed.contentMarkdown,
          },
          context.actor,
          [context.actor],
          1,
          false,
        );
        const checkpoint = await context.wiki.persistCollaborationSnapshot(
          context.org,
          child.id,
          {
            encodedState: Y.encodeStateAsUpdate(doc),
            contentMarkdown: changed.contentMarkdown,
          },
          context.actor,
          [context.actor],
          1,
          true,
        );
        expect(checkpoint.checkpointCreated).toBe(true);
        expect(checkpoint.revision).toBe(changed.revision + 1);
        const after = await context.wiki.findDocumentById(
          context.org,
          child.id,
        );
        expect(after?.updatedAt).toEqual(before?.updatedAt);
        const current = await context.app
          .get(OutboxSemanticSourceState)
          .current({
            organizationId: context.org,
            aggregateKind: 'wiki_document',
            aggregateId: child.id,
          });
        expect(current?.version.desiredSeq).toBe(5);
        const retained = await delayed(child.id, 5);
        expect(retained.id).toBe(body.id);
        expect(retained.timestamp + retained.delay).toBe(
          body.timestamp + body.delay,
        );
        await retained.promote();
        await waitForCondition(
          async () => (await retained.getState()) === 'completed',
          '너무 이른 auto 작업이 끝나지 않았습니다.',
        );
        await delayed(child.id, 5);
        expect(
          context.extractor.calls.filter((text) => text === '최신 자동 본문')
            .length,
        ).toBe(0);
      } finally {
        doc.destroy();
      }
    });
    it('F7-15 부모 rename은 자식 seq·vector를 바꾸지 않고 현재 owner tree로 확인한다', async () => {
      const parent = await context.createWiki('이전 부모 이름', '');
      const child = await context.createWiki(
        '자식 제목',
        '상위 이름을 고정하지 않은 자식 본문',
      );
      await context.wiki.updateDocumentMetadata(
        context.org,
        child.id,
        context.actor,
        { title: child.title, parentDocumentId: parent.id, position: 0 },
      );
      await context.refresh.requestManualRefresh(
        context.org,
        child.id,
        context.actor,
      );
      await context.indexed(child.id, 1);
      const scope = {
        organizationId: context.org,
        aggregateKind: 'wiki_document',
        aggregateId: child.id,
      } as const;
      const state = context.app.get(OutboxSemanticSourceState);
      const before = await state.current(scope);
      const calls = context.extractor.calls.filter(
        (text) => text === child.contentMarkdown,
      ).length;
      await context.wiki.updateDocumentMetadata(
        context.org,
        parent.id,
        context.actor,
        { title: '현재 부모 이름', parentDocumentId: null, position: 0 },
      );
      const after = await state.current(scope);
      expect(after?.version).toEqual(before?.version);
      expect(after?.state?.activeGenerationId).toBe(
        before?.state?.activeGenerationId,
      );
      expect(
        context.extractor.calls.filter((text) => text === child.contentMarkdown)
          .length,
      ).toBe(calls);
      const inputs = context.embedder.calls
        .flat()
        .filter((text) => text.includes(child.contentMarkdown));
      expect(inputs).toHaveLength(1);
      expect(inputs[0]).not.toContain('이전 부모 이름');
      expect(inputs[0]).not.toContain('현재 부모 이름');
      const tree = await context.wiki.getTreeForOrganization(context.org);
      expect(tree.find((item) => item.id === parent.id)?.title).toBe(
        '현재 부모 이름',
      );
    });
  },
);
