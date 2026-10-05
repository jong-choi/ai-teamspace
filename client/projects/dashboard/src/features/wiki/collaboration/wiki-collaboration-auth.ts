import { getProblemDetails } from '@repo/client/api-client/runtime';

export type WikiCollaborationAuthenticationAction =
  'refresh-token' | 'update-required' | 'access-denied';

const protocolVersionUnsupportedReason =
  'WIKI_COLLABORATION_PROTOCOL_VERSION_UNSUPPORTED';
const accessDeniedReasons = new Set([
  'WIKI_COLLABORATION_ACCESS_DENIED',
  'WIKI_DOCUMENT_NOT_FOUND',
]);

export function classifyWikiCollaborationAuthenticationFailure(
  reason: string,
): WikiCollaborationAuthenticationAction {
  if (reason === protocolVersionUnsupportedReason) {
    return 'update-required';
  }
  if (accessDeniedReasons.has(reason)) {
    return 'access-denied';
  }
  return 'refresh-token';
}

export function isWikiCollaborationSessionAccessDenied(
  error: unknown,
): boolean {
  const problem = getProblemDetails(error);
  return problem?.status === 403 || problem?.status === 404;
}
