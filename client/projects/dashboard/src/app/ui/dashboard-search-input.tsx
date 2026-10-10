import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { Icon } from '@repo/client/rnr/components/ui/icon';
import { Input } from '@repo/client/rnr/components/ui/input';
import { cn } from '@repo/client/rnr/lib/utils';

import { Search } from 'lucide-react-native';

// 모든 검색 입력이 쓰는 공통 모양이다. 왼쪽 돋보기 아이콘, 높이 h-8, 글자 text-xs로 고정한다.
// 폭과 배치는 감싸는 쪽이 className으로 정한다.
export function DashboardSearchInput({
  className,
  ...props
}: Omit<ComponentProps<typeof Input>, 'className'> & {
  className?: string;
}) {
  return (
    <View className={cn('relative justify-center', className)}>
      <Icon
        as={Search}
        className="pointer-events-none absolute left-2.5 z-10 size-3.5 text-muted-foreground"
      />
      <Input className="h-8 py-1 pl-8 text-xs sm:h-8 md:text-xs" {...props} />
    </View>
  );
}
