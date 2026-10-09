import { expect, type Locator, type Page, test } from '@playwright/test';

const apiURL = `http://localhost:${process.env.E2E_API_PORT ?? 3101}`;
const webURL = `http://localhost:${process.env.E2E_WEB_PORT ?? 8083}`;

const ALL_SCOPES = [
  'organizations:read',
  'organizations:write',
  'chat:read',
  'chat:write',
  'wiki:read',
  'wiki:write',
  'projects:read',
  'projects:write',
  'calendar:read',
  'calendar:write',
];

type E2EWorkspace = {
  organizationId: string;
  projectId: string;
};

/**
 * 로그인만 한 새 사용자를 만든다. 조직을 만들고 조직·개인 MCP 정책에 전체 scope를 허용한다.
 * Agent 위임 연결은 하지 않는다. 로그인만으로 채팅이 동작해야 하기 때문이다.
 */
async function createE2EWorkspace(page: Page): Promise<E2EWorkspace> {
  const id = `${Date.now()}${Math.floor(Math.random() * 1_000)}`;
  const request = page.request;
  const headers = { Origin: webURL };

  const signUp = await request.post(`${apiURL}/api/auth/sign-up/email`, {
    data: {
      email: `agent-e2e-${id}@example.com`,
      name: `Agent E2E ${id}`,
      password: 'StrongPassword123!',
      username: `agente2e${id}`,
    },
    headers,
  });
  expect(signUp.status(), '회원가입').toBe(200);

  const created = await request.post(`${apiURL}/organizations`, {
    data: { name: `Agent E2E ${id}`, slug: `agent-e2e-${id}` },
    headers,
  });
  expect(created.status(), '조직 생성').toBe(201);
  const organizationId: string = (await created.json()).organization.id;

  const access = await (
    await request.get(`${apiURL}/organizations/${organizationId}/mcp-access`, {
      headers,
    })
  ).json();
  const organizationPolicy = await request.patch(
    `${apiURL}/organizations/${organizationId}/mcp-access/organization-policy`,
    {
      data: {
        allowedScopes: ALL_SCOPES,
        expectedRevision: access.organizationPolicy.revision,
      },
      headers,
    },
  );
  expect(organizationPolicy.status(), '조직 MCP 정책').toBe(200);
  const refreshed = await (
    await request.get(`${apiURL}/organizations/${organizationId}/mcp-access`, {
      headers,
    })
  ).json();
  const personalPolicy = await request.patch(
    `${apiURL}/organizations/${organizationId}/mcp-access/me`,
    {
      data: {
        requestedScopes: ALL_SCOPES,
        expectedRevision: refreshed.myPolicy.revision,
      },
      headers,
    },
  );
  expect(personalPolicy.status(), '개인 MCP 정책').toBe(200);

  const project = await request.post(
    `${apiURL}/organizations/${organizationId}/projects`,
    { data: { key: 'AGT', name: 'Agent E2E 프로젝트' }, headers },
  );
  expect(project.status(), '프로젝트 생성').toBe(201);
  const projectId: string = (await project.json()).id;

  return { organizationId, projectId };
}

function panel(page: Page) {
  return page.getByLabel('Agent 채팅 패널');
}

// 페이지 이동·hydration 직후의 클릭은 무시될 수 있어 패널이 실제로 보일 때까지 토글을 다시 누른다.
async function openPanel(page: Page, toggle: Locator) {
  await expect(async () => {
    if (!(await panel(page).isVisible())) await toggle.click();
    await expect(panel(page)).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 15_000 });
}

test.describe('Agent 채팅 패널 (데스크톱)', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('nav 토글로 열고 닫고, 확대·축소와 페이지 이동 후에도 draft를 유지한다', async ({
    page,
  }) => {
    await createE2EWorkspace(page);
    await page.goto('/projects');

    await openPanel(
      page,
      page.getByRole('button', { name: 'AI', exact: true }),
    );
    const input = panel(page).getByLabel('Agent에게 보낼 메시지');
    await expect(input).toBeVisible();
    await input.fill('나중에 보낼 초안');

    // 너비 transition이 없어야 한다.
    const transition = await panel(page).evaluate(
      (element) => getComputedStyle(element).transitionProperty,
    );
    expect(transition).not.toContain('width');

    await panel(page).getByLabel('채팅 확대').click();
    await expect(panel(page).getByLabel('채팅 축소')).toBeVisible();
    await expect(
      panel(page)
        .getByLabel('Agent 대화 목록')
        .or(panel(page).getByText('아직 Agent 대화가 없습니다.')),
    ).toBeVisible();
    await panel(page).getByLabel('채팅 축소').click();

    await panel(page).getByLabel('채팅 닫기').click();
    await expect(panel(page)).toBeHidden();

    await page.getByRole('link', { name: '회의일정' }).click();
    await expect(page).toHaveURL(/\/calendar/);
    await openPanel(
      page,
      page.getByRole('button', { name: 'AI', exact: true }),
    );
    await expect(panel(page).getByLabel('Agent에게 보낼 메시지')).toHaveValue(
      '나중에 보낼 초안',
    );
  });

  test('메시지를 보내면 응답과 추론 블록이 대화 흐름에 표시된다', async ({
    page,
  }) => {
    await createE2EWorkspace(page);
    await page.goto('/projects');
    await openPanel(
      page,
      page.getByRole('button', { name: 'AI', exact: true }),
    );

    await panel(page).getByLabel('추론 수준 선택').click();
    await page.getByRole('option', { name: '추론 낮음' }).click();

    const input = panel(page).getByLabel('Agent에게 보낼 메시지');
    await input.fill('도구를 쓰지 말고 한 문장으로 인사만 해 줘.');
    await input.press('Enter');

    await expect(panel(page).getByLabel(/생각 (펼치기|접기)/)).toBeVisible({
      timeout: 180_000,
    });
    await expect(panel(page).getByLabel('응답 복사')).toBeVisible({
      timeout: 180_000,
    });
  });

  test('HITL 승인 후 열려 있는 티켓 보드가 새로고침 없이 갱신된다', async ({
    page,
  }) => {
    const workspace = await createE2EWorkspace(page);
    await page.goto(`/projects/${workspace.projectId}`);
    await expect(page.getByText('Agent E2E 프로젝트').first()).toBeVisible();

    await openPanel(
      page,
      page.getByRole('button', { name: 'AI', exact: true }),
    );
    await panel(page).getByLabel('추론 수준 선택').click();
    await page.getByRole('option', { name: '추론 낮음' }).click();
    const input = panel(page).getByLabel('Agent에게 보낼 메시지');
    await input.fill(
      `프로젝트 ID ${workspace.projectId}에 제목이 "에이전트가 만든 티켓"인 티켓을 하나 만들어 줘. 다른 작업은 하지 마.`,
    );
    await input.press('Enter');

    await expect(panel(page).getByLabel('Agent 작업 승인 요청')).toBeVisible({
      timeout: 180_000,
    });
    await expect(
      panel(page).getByLabel('Agent에게 보낼 메시지'),
    ).not.toBeEditable();
    await panel(page).getByLabel('결정 전달').click();

    await expect(page.getByText('에이전트가 만든 티켓').first()).toBeVisible({
      timeout: 180_000,
    });
  });
});

test.describe('Agent 채팅 패널 (모바일)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('상단 헤더 토글로 전체 영역에 열고 확대 버튼은 없다', async ({
    page,
  }) => {
    await createE2EWorkspace(page);
    await page.goto('/projects');

    await openPanel(page, page.getByLabel('Agent 채팅 열기'));
    await expect(panel(page).getByLabel('채팅 확대')).toHaveCount(0);
    const box = await panel(page).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(380);

    await page.getByLabel('Agent 채팅 닫기').first().click();
    await expect(panel(page)).toBeHidden();
  });
});
