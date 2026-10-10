import type { ComponentProps } from 'react';

import {
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/client/rnr/components/ui/select';
import { cn } from '@repo/client/rnr/lib/utils';

// 모든 선택 상자가 쓰는 공통 크기다. 입력창과 같은 높이 h-8, 글자 text-xs로 맞춘다.
export function DashboardSelectTrigger({
  className,
  ...props
}: ComponentProps<typeof SelectTrigger>) {
  return (
    <SelectTrigger
      className={cn('h-8 py-1 sm:h-8 sm:py-1', className)}
      size="sm"
      {...props}
    />
  );
}

export function DashboardSelectValue({
  className,
  ...props
}: ComponentProps<typeof SelectValue>) {
  return <SelectValue className={cn('text-xs', className)} {...props} />;
}

export function DashboardSelectItem({
  className,
  textClassName,
  ...props
}: ComponentProps<typeof SelectItem>) {
  return (
    <SelectItem
      className={cn('py-1.5 sm:py-1', className)}
      textClassName={cn('text-xs', textClassName)}
      {...props}
    />
  );
}
