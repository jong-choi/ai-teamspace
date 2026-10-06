import { CalendarProjectNotFoundError } from '#server/calendar/domain/calendar.error.js';
import { ProjectsCalendarReferenceAdapter } from '#server/calendar/infrastructure/project/projects/projects-calendar-reference.adapter.js';
import { ProjectReferenceRepository } from '#server/projects/infrastructure/persistence/project-reference.repository.js';
import { ProjectReferenceQueryService } from '#server/projects/project-reference-query.service.js';

import { jest } from '@jest/globals';

class FakeProjectReferenceRepository extends ProjectReferenceRepository {
  findByIds = jest.fn<ProjectReferenceRepository['findByIds']>();
}

describe('프로젝트 캘린더 참조 adapter', () => {
  const organizationId = 'organization-a';
  const projectId = 'project-a';

  it('같은 조직의 프로젝트 참조를 허용한다', async () => {
    const repository = new FakeProjectReferenceRepository();
    repository.findByIds.mockResolvedValue([
      { id: projectId, name: '프로젝트 A' },
    ]);
    const adapter = new ProjectsCalendarReferenceAdapter(
      new ProjectReferenceQueryService(repository),
    );

    await expect(
      adapter.assertReference(organizationId, projectId),
    ).resolves.toBeUndefined();
  });

  it('현재 조직에서 조회되지 않는 프로젝트를 거부한다', async () => {
    const repository = new FakeProjectReferenceRepository();
    repository.findByIds.mockResolvedValue([]);
    const adapter = new ProjectsCalendarReferenceAdapter(
      new ProjectReferenceQueryService(repository),
    );

    await expect(
      adapter.assertReference(organizationId, projectId),
    ).rejects.toBeInstanceOf(CalendarProjectNotFoundError);
  });

  it('프로젝트 요약은 public query 결과만 전달한다', async () => {
    const summaries = [{ id: projectId, name: '프로젝트 A' }];
    const repository = new FakeProjectReferenceRepository();
    repository.findByIds.mockResolvedValue(summaries);
    const adapter = new ProjectsCalendarReferenceAdapter(
      new ProjectReferenceQueryService(repository),
    );

    await expect(
      adapter.listSummaries(organizationId, [projectId]),
    ).resolves.toEqual(summaries);
  });
});
