import { ToolMessage } from '@langchain/core/messages';
import { createMiddleware } from 'langchain';

/** deepagents가 기본으로 붙이는 파일 도구다. 연결된 파일 시스템이 없어 쓰지 않는다. */
const FILESYSTEM_TOOL_NAMES: ReadonlySet<unknown> = new Set([
  'ls',
  'read_file',
  'write_file',
  'edit_file',
  'delete',
  'glob',
  'grep',
  'execute',
]);

/** 파일 도구를 모델에게 보이지 않게 하고, 그래도 부르면 실행하지 않는다. */
export const filesystemToolExclusionMiddleware = createMiddleware({
  name: 'FilesystemToolExclusion',
  wrapModelCall: (request, handler) =>
    handler({
      ...request,
      tools: request.tools.filter(
        (tool) => !FILESYSTEM_TOOL_NAMES.has(tool.name),
      ),
    }),
  wrapToolCall: (request, handler) => {
    const { name, id } = request.toolCall;
    if (!FILESYSTEM_TOOL_NAMES.has(name)) return handler(request);

    return new ToolMessage({
      content: `${name} 도구는 없습니다.`,
      tool_call_id: id ?? '',
      name,
      status: 'error',
    });
  },
});
