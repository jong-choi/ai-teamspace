import { CuratedGraphEdgeCommandResult } from '@repo/client/api-client/generated/schemas/curatedGraphEdgeCommandResult.zod';
import { CuratedGraphNodeCommandResult } from '@repo/client/api-client/generated/schemas/curatedGraphNodeCommandResult.zod';
import { GraphNodeList } from '@repo/client/api-client/generated/schemas/graphNodeList.zod';
import { OrganizationAccess } from '@repo/client/api-client/generated/schemas/organizationAccess.zod';

import { expect, type Page, test } from '@playwright/test';

const apiURL = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const webURL = `http://localhost:${process.env.E2E_WEB_PORT ?? 8083}`;

type GraphWorkspace = {
  organizationId: string;
  nodeIds: [string, string];
  nodeRevisions: [number, number];
  edgeId: string;
  edgeRevision: number;
  focusNodeId: string;
};

async function createGraphWorkspace(page: Page): Promise<GraphWorkspace> {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const headers = { Origin: webURL };
  const request = page.request;
  const signUp = await request.post(`${apiURL}/api/auth/sign-up/email`, {
    data: {
      email: `graph-e2e-${suffix}@example.com`,
      name: `Graph E2E ${suffix}`,
      password: 'StrongPassword123!',
      username: `graphe2e${suffix}`,
    },
    headers,
  });
  expect(signUp.status(), '회원가입').toBe(200);
  const createdOrganization = await request.post(`${apiURL}/organizations`, {
    data: { name: `Graph E2E ${suffix}`, slug: `graph-e2e-${suffix}` },
    headers,
  });
  expect(createdOrganization.status(), '조직 생성').toBe(201);
  const organizationId = OrganizationAccess.parse(
    await createdOrganization.json(),
  ).organization.id;

  const first = await request.post(
    `${apiURL}/organizations/${organizationId}/knowledge-graph/curated/nodes`,
    {
      data: { kind: 'technology', title: 'P9 Alpha', properties: {} },
      headers,
    },
  );
  const second = await request.post(
    `${apiURL}/organizations/${organizationId}/knowledge-graph/curated/nodes`,
    {
      data: { kind: 'concept', title: 'P9 Beta', properties: {} },
      headers,
    },
  );
  expect(first.status(), '첫 노드 생성').toBe(201);
  expect(second.status(), '둘째 노드 생성').toBe(201);
  const firstNode = CuratedGraphNodeCommandResult.parse(await first.json());
  const secondNode = CuratedGraphNodeCommandResult.parse(await second.json());

  const edge = await request.post(
    `${apiURL}/organizations/${organizationId}/knowledge-graph/curated/edges`,
    {
      data: {
        sourceNodeKind: 'curated_node',
        sourceNodeId: firstNode.id,
        targetNodeKind: 'curated_node',
        targetNodeId: secondNode.id,
        predicate: 'depends_on',
        directed: true,
        properties: {},
      },
      headers,
    },
  );
  expect(edge.status(), '관계 생성').toBe(201);
  const edgeBody = CuratedGraphEdgeCommandResult.parse(await edge.json());
  const listed = await request.get(
    `${apiURL}/organizations/${organizationId}/knowledge-graph/nodes?q=P9%20Alpha&limit=5`,
    { headers },
  );
  expect(listed.status(), '노드 조회').toBe(200);
  const listBody = GraphNodeList.parse(await listed.json());
  expect(listBody.items).toHaveLength(1);
  const focusNode = listBody.items[0];
  if (!focusNode) throw new Error('focus 노드를 찾지 못했습니다.');

  return {
    organizationId,
    nodeIds: [firstNode.id, secondNode.id],
    nodeRevisions: [firstNode.revision, secondNode.revision],
    edgeId: edgeBody.id,
    edgeRevision: edgeBody.revision,
    focusNodeId: focusNode.id,
  };
}

async function cleanupGraphWorkspace(page: Page, workspace: GraphWorkspace) {
  const headers = { Origin: webURL };
  await page.request.delete(
    `${apiURL}/organizations/${workspace.organizationId}/knowledge-graph/curated/edges/${workspace.edgeId}?expectedRevision=${workspace.edgeRevision}`,
    { headers },
  );
  await page.request.delete(
    `${apiURL}/organizations/${workspace.organizationId}/knowledge-graph/curated/nodes/${workspace.nodeIds[0]}?expectedRevision=${workspace.nodeRevisions[0]}`,
    { headers },
  );
  await page.request.delete(
    `${apiURL}/organizations/${workspace.organizationId}/knowledge-graph/curated/nodes/${workspace.nodeIds[1]}?expectedRevision=${workspace.nodeRevisions[1]}`,
    { headers },
  );
}

test.describe('지식 그래프 화면', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('실제 API의 표·상세·공통 모달·focus 캔버스를 연결한다', async ({
    page,
  }) => {
    const workspace = await createGraphWorkspace(page);
    try {
      await page.goto('/knowledge-graph/data');
      await expect(page.getByText('지식 그래프 데이터 관리자')).toBeVisible();
      await expect(page.getByText('P9 Alpha').first()).toBeVisible();
      await page.getByLabel('P9 Alpha 노드 상세 보기').click();
      await expect(page.getByText('사용자 엔티티').first()).toBeVisible();
      // 데이터 화면의 상세는 모달이라 뒤쪽 표 행 버튼 대신 상세 안의 편집 버튼을 누른다.
      await page.getByRole('button', { name: '노드 편집' }).click();
      await expect(page.getByText('엔티티 노드 수정')).toBeVisible();
      await page.getByLabel('표시 라벨').fill('P9 Alpha Updated');
      await page.getByText('저장하기').click();
      await expect(page.getByText('P9 Alpha Updated').first()).toBeVisible();
      workspace.nodeRevisions[0] += 1;
      // 편집 모달이 닫히면 선택이 남아 상세 Dialog가 다시 열리므로 닫고 탭을 누른다.
      const detailDialog = page.getByRole('dialog', { name: '엔티티 상세' });
      await expect(detailDialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(detailDialog).toBeHidden();

      await page.getByText('관계 관리 (Edges)').click();
      await expect(page.getByText('DEPENDS_ON').first()).toBeVisible();

      await page.goto(
        `/knowledge-graph?focusKind=curated_node&focusId=${encodeURIComponent(workspace.focusNodeId)}`,
      );
      await expect(page.getByLabel(/지식 그래프 캔버스/)).toBeVisible();
      await expect(page.getByText('P9 Alpha Updated').first()).toBeVisible();
      await page.getByLabel('테마 모드 전환').first().click();
      await expect(page.getByLabel(/지식 그래프 캔버스/)).toBeVisible();
      await page.getByLabel('테마 모드 전환').first().click();
      await expect(page.getByLabel(/지식 그래프 캔버스/)).toBeVisible();
    } finally {
      await cleanupGraphWorkspace(page, workspace);
    }
  });
});
