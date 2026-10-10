import type { ComponentProps } from 'react';

import { Input } from '@repo/client/rnr/components/ui/input';
import { cn } from '@repo/client/rnr/lib/utils';

// 모든 입력창이 쓰는 공통 크기다. 높이 h-8, 글자 text-xs로 고정한다.
// 여러 줄 입력처럼 더 커야 하는 곳만 className으로 높이를 덮어쓴다.
export function DashboardInput({
  className,
  ...props
}: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn('h-8 py-1 text-xs sm:h-8 md:text-xs', className)}
      {...props}
    />
  );
}
