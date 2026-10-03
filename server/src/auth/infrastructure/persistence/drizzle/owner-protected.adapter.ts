import {
  OrganizationMemberNotFoundError,
  OwnerTransferRequiredError,
} from '#server/organizations/domain/organization.error.js';
import { OrganizationRoleSchema } from '#server/organizations/domain/organization-role.js';

import type { DBAdapter, DBTransactionAdapter } from 'better-auth/adapters';

// Better Auth가 소유하는 mutation의 조건을 확장한다. Work OS에서 auth table을 직접 변경하지 않는다.
export function protectOrganizationOwners(adapter: DBAdapter): DBAdapter {
  return {
    ...protectMemberMutations(adapter),
    transaction: (operation) =>
      adapter.transaction((tx) => operation(protectMemberMutations(tx))),
  };
}

function protectMemberMutations(
  adapter: DBTransactionAdapter,
): DBTransactionAdapter {
  const nonOwner = {
    field: 'role',
    operator: 'in',
    value: OrganizationRoleSchema.options.filter(
      (role) => role !== OrganizationRoleSchema.enum.owner,
    ),
  } as const;
  return {
    ...adapter,
    async update<T>(input: Parameters<DBAdapter['update']>[0]) {
      if (
        input.model !== 'member' ||
        !('role' in input.update) ||
        input.update.role === OrganizationRoleSchema.enum.owner
      ) {
        return adapter.update<T>(input);
      }
      const updated = await adapter.update<T>({
        ...input,
        where: [...input.where, nonOwner],
      });
      if (!updated) {
        const exists = await adapter.findOne({
          model: input.model,
          where: input.where,
        });
        if (exists) throw new OwnerTransferRequiredError();
        throw new OrganizationMemberNotFoundError();
      }
      return updated;
    },
    async delete(input) {
      if (input.model !== 'member') return adapter.delete(input);
      const deleted = await adapter.deleteMany({
        ...input,
        where: [...input.where, nonOwner],
      });
      if (!deleted) {
        const exists = await adapter.findOne({
          model: input.model,
          where: input.where,
        });
        if (exists) throw new OwnerTransferRequiredError();
        throw new OrganizationMemberNotFoundError();
      }
    },
  };
}
