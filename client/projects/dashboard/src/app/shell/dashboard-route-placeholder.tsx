import type { ReactNode } from 'react';
import { View } from 'react-native';

import {
  DashboardBreadcrumbItem,
  DashboardPageHeader,
} from '@core/app/shell/dashboard-page-header';

// 본문을 아직 그릴 수 없는 동안에도 상단 바는 보이게 하는 틀이다.
// 세션 확인, 조직 조회, 로그인 필요 같은 상태 화면을 본문 자리에 넣는다.
export function DashboardRoutePlaceholder({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View className="min-h-0 flex-1 bg-background">
      <DashboardPageHeader>
        <DashboardBreadcrumbItem current>{title}</DashboardBreadcrumbItem>
      </DashboardPageHeader>
      {children}
    </View>
  );
}
