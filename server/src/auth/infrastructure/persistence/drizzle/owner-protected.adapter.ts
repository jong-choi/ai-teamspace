import {
  OrganizationMemberNotFoundError,
  OwnerTransferRequiredError,
} from '@/organizations/domain/organization.error';
import { OrganizationRoleSchema } from '@/organizations/domain/organization-role';

import type {
  DBAdapter,
  DBTransactionAdapter,
  Where,
} from 'better-auth/adapters';

const nonOwnerRoleFilter: Where = {
  field: 'role',
  operator: 'in',
  value: OrganizationRoleSchema.options.filter(
    (role) => role !== OrganizationRoleSchema.enum.owner,
  ),
};

// Better Auth가 소유하는 mutation을 우회하지 않고, generic member API가 owner를 직접 감소시키지 못하게 write 시점에 보호한다.
export function protectOrganizationOwners(adapter: DBAdapter): DBAdapter {
  return {
    ...protectMemberMutations(adapter),
    transaction: (operation) =>
      adapter.transaction((transaction) =>
        operation(protectMemberMutations(transaction)),
      ),
  };
}

function protectMemberMutations(
  adapter: DBTransactionAdapter,
): DBTransactionAdapter {
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
        where: [...input.where, nonOwnerRoleFilter],
      });
      if (updated) {
        return updated;
      }

      const exists = await adapter.findOne({
        model: input.model,
        where: input.where,
      });
      if (exists) {
        throw new OwnerTransferRequiredError();
      }
      throw new OrganizationMemberNotFoundError();
    },
    async delete(input) {
      if (input.model !== 'member') {
        return adapter.delete(input);
      }

      const deleted = await adapter.deleteMany({
        ...input,
        where: [...input.where, nonOwnerRoleFilter],
      });
      if (deleted) {
        return;
      }

      const exists = await adapter.findOne({
        model: input.model,
        where: input.where,
      });
      if (exists) {
        throw new OwnerTransferRequiredError();
      }
      throw new OrganizationMemberNotFoundError();
    },
  };
}
