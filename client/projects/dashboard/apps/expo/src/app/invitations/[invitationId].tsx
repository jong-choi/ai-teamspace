import { useLocalSearchParams } from 'expo-router';

import { InvitationRoute } from '@core/features/invitations/invitation-route';

export default function InvitationScreen() {
  const params = useLocalSearchParams<{ invitationId: string }>();

  return <InvitationRoute invitationId={firstParam(params.invitationId)} />;
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
