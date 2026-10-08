import { Test } from '@nestjs/testing';

import { ProjectionDeliveryRepository } from '@/knowledge-graph/infrastructure/persistence/projection-delivery.repository';
import { WorkosSourceProvider } from '@/knowledge-graph/infrastructure/source/workos-source.provider';
import { KnowledgeGraphBackfillService } from '@/knowledge-graph/knowledge-graph-backfill.service';

describe('업무 그래프 초기 접수와 재조정', () => {
  const listIds = jest.fn();
  const initializeBatch = jest.fn();
  const requeuePendingBatch = jest.fn();
  let service: KnowledgeGraphBackfillService;

  beforeEach(async () => {
    jest.resetAllMocks();
    listIds.mockResolvedValue([]);
    initializeBatch.mockResolvedValue(true);
    requeuePendingBatch.mockResolvedValue(0);
    const moduleRef = await Test.createTestingModule({
      providers: [
        KnowledgeGraphBackfillService,
        { provide: WorkosSourceProvider, useValue: { listIds } },
        {
          provide: ProjectionDeliveryRepository,
          useValue: { initializeBatch, requeuePendingBatch },
        },
      ],
    }).compile();
    service = moduleRef.get(KnowledgeGraphBackfillService);
  });

  it('owner가 반환한 조직별 배치와 cursor를 초기 접수에 전달한다', async () => {
    const rows = [{ id: 'wiki-2' }, { id: 'wiki-3' }];
    listIds.mockResolvedValueOnce(rows);
    await expect(
      service.enqueueSourceBatch('wiki_document', 'org-a', 'wiki-1', 2),
    ).resolves.toEqual({ count: 2, nextCursor: 'wiki-3' });
    expect(listIds).toHaveBeenCalledWith('wiki_document', 'org-a', 'wiki-1', 2);
    expect(initializeBatch).toHaveBeenCalledWith(
      'wiki_document',
      'org-a',
      rows,
    );
  });

  it('curated 삭제 상태를 초기 접수까지 보존한다', async () => {
    const rows = [{ id: 'node-1', deletedAt: new Date(0) }];
    listIds.mockResolvedValueOnce(rows);
    await service.enqueueSourceBatch('curated_node', 'org-a', null);
    expect(initializeBatch).toHaveBeenCalledWith('curated_node', 'org-a', rows);
  });

  it('owner 조회 실패 뒤에는 접수를 실행하지 않는다', async () => {
    listIds.mockRejectedValueOnce(new Error('owner 조회 실패'));
    await expect(
      service.enqueueSourceBatch('project', 'org-a', null),
    ).rejects.toThrow('owner 조회 실패');
    expect(initializeBatch).not.toHaveBeenCalled();
  });

  it('초기 접수 실패를 성공한 배치로 반환하지 않는다', async () => {
    initializeBatch.mockRejectedValueOnce(new Error('원자적 접수 실패'));
    await expect(
      service.enqueueSourceBatch('project', 'org-a', null),
    ).rejects.toThrow('원자적 접수 실패');
  });

  it.each([
    [-1, 1],
    [2.7, 2],
    [1000, 500],
  ])(
    '배치 크기 %s를 유한한 정수 %s로 제한한다',
    async (requested, expected) => {
      await service.enqueueSourceBatch('project', 'org-a', null, requested);
      expect(listIds).toHaveBeenCalledWith('project', 'org-a', null, expected);
    },
  );

  it.each([NaN, Infinity, -Infinity])(
    '잘못된 배치 크기 %s는 읽기와 쓰기 전에 거부한다',
    async (limit) => {
      await expect(
        service.enqueueSourceBatch('project', 'org-a', null, limit),
      ).rejects.toThrow('유한한 숫자');
      expect(listIds).not.toHaveBeenCalled();
      expect(initializeBatch).not.toHaveBeenCalled();
    },
  );

  it('재조정은 전용 persistence capability에서 원자적으로 처리한 개수를 반환한다', async () => {
    requeuePendingBatch.mockResolvedValueOnce(1);
    await expect(service.requeueUnapplied(5)).resolves.toBe(1);
    expect(requeuePendingBatch).toHaveBeenCalledWith(5);
    expect(initializeBatch).not.toHaveBeenCalled();
  });

  it('재예약 실패는 처리된 개수로 숨기지 않는다', async () => {
    requeuePendingBatch.mockRejectedValueOnce(new Error('재예약 실패'));
    await expect(service.requeueUnapplied()).rejects.toThrow('재예약 실패');
  });

  it('접수 거부를 성공한 cursor로 반환하지 않는다', async () => {
    initializeBatch.mockResolvedValueOnce(false);
    await expect(
      service.enqueueSourceBatch('project', 'org-a', null),
    ).rejects.toThrow('소유권');
  });
});
