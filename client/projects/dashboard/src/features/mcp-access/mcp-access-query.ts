import {
  getMcpAccessControllerGetCompositeQueryKey,
  useMcpAccessControllerGetCompositeSuspense,
} from '@repo/client/api-client';

export function getMcpAccessQueryKey(organizationId: string) {
  return getMcpAccessControllerGetCompositeQueryKey(organizationId);
}

export function useMcpAccess(organizationId: string) {
  return useMcpAccessControllerGetCompositeSuspense(organizationId);
}
