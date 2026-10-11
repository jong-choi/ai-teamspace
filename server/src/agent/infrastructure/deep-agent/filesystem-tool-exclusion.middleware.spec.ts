import { DeepAgentBuilder } from '@/agent/infrastructure/deep-agent/deep-agent.builder';

import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { FakeStreamingChatModel } from '@langchain/core/utils/testing';
import { z } from 'zod';

class ToolRecordingModel extends FakeStreamingChatModel {
  readonly boundToolNames: string[][] = [];

  override bindTools(tools: { name?: unknown }[]) {
    this.boundToolNames.push(tools.map((bound) => String(bound.name)));
    return this;
  }
}

describe('filesystemToolExclusionMiddleware', () => {
  it('모델에게 파일 도구를 보여 주지 않고 업무 도구는 그대로 둔다', async () => {
    const model = new ToolRecordingModel({
      responses: [new AIMessage('안녕하세요')],
    });
    const projectsList = tool(() => '[]', {
      name: 'projects_list',
      description: '프로젝트 목록을 조회합니다.',
      schema: z.object({}),
    });
    const agent = new DeepAgentBuilder().buildExecution({
      models: { root: model, researcher: model, operator: model },
      session: {
        tools: [projectsList],
        readOnlyTools: [projectsList],
        interruptOn: {},
        toolIdentities: new Map(),
        close: () => Promise.resolve(),
      },
    });

    await agent.invoke({ messages: [new HumanMessage('안녕')] });

    const names = model.boundToolNames.at(-1) ?? [];
    expect(names).toContain('projects_list');
    expect(names).toEqual(
      expect.not.arrayContaining([
        'ls',
        'read_file',
        'write_file',
        'edit_file',
        'delete',
        'glob',
        'grep',
        'execute',
      ]),
    );
  });
});
