import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@repo/client/rnr/components/ui/avatar';
import { Icon } from '@repo/client/rnr/components/ui/icon';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';

import { UserRound } from 'lucide-react-native';

export function DashboardAccountAvatar() {
  const { currentUser, sessionPending, sessionError } = useDashboardPlatform();
  const image = sessionPending || sessionError ? null : currentUser?.image;

  return (
    <Avatar
      alt={`${currentUser?.name ?? '계정'} 프로필 사진`}
      className="size-7 shrink-0 border border-border"
    >
      {image ? <AvatarImage source={{ uri: image }} /> : null}
      <AvatarFallback className="bg-secondary">
        <Icon as={UserRound} className="size-4 text-secondary-foreground" />
      </AvatarFallback>
    </Avatar>
  );
}
