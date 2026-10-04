import { useLocalSearchParams } from 'expo-router';

import { OrganizationMembersRoute } from '@core/features/organizations/organization-members-route';

export default function OrganizationMembersScreen() {
  const params = useLocalSearchParams<{ organizationId: string }>();

  return (
    <OrganizationMembersRoute
      organizationId={firstParam(params.organizationId)}
    />
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
