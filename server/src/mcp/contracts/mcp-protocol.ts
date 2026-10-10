/**
 * Work OS MCP endpoint가 기준으로 삼는 최신 MCP protocol revision이다.
 * 내부 client는 이 revision에 pin한다. 2025 규격 client의 요청도 요청 단위 stateless로 받는다.
 */
export const WORK_OS_MCP_PROTOCOL_VERSION = '2026-07-28';
