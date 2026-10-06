import { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import {
  useCalendarActiveOrganization,
  useCalendarMeetings,
  useCalendarRooms,
} from '@core/features/calendar/calendar-queries';
import {
  CalendarCreateDialog,
  type CalendarCreateRequest,
} from '@core/features/calendar/components/calendar-create-dialog';
import { CalendarHeader } from '@core/features/calendar/components/calendar-header';
import { CalendarListView } from '@core/features/calendar/components/calendar-list-view';
import { CalendarMeetingDetailDialog } from '@core/features/calendar/components/calendar-meeting-detail-dialog';
import { CalendarMiniPanel } from '@core/features/calendar/components/calendar-mini-panel';
import { CalendarMonthView } from '@core/features/calendar/components/calendar-month-view';
import { CalendarRoomsDialog } from '@core/features/calendar/components/calendar-rooms-dialog';
import {
  CalendarDayView,
  CalendarWeekView,
} from '@core/features/calendar/components/calendar-timeline-view';
import { CalendarToolbar } from '@core/features/calendar/components/calendar-toolbar';
import type { CalendarCategory } from '@core/features/calendar/lib/calendar-category';
import {
  type CalendarViewMode,
  getCalendarQueryRange,
  shiftCalendarPeriod,
} from '@core/features/calendar/lib/calendar-range';
import {
  getSystemTimeZone,
  todayDateKey,
} from '@core/features/calendar/lib/calendar-time-zone';

export function CalendarRoute() {
  const { currentUserId, sessionPending } = useDashboardPlatform();

  if (sessionPending) {
    return (
      <DashboardShell activeNavigationItem="calendar">
        <DashboardLoading label="세션을 확인하는 중..." />
      </DashboardShell>
    );
  }

  if (!currentUserId) {
    return (
      <DashboardShell activeNavigationItem="calendar">
        <DashboardState
          description="회의일정은 조직의 로그인 세션을 사용합니다. 먼저 로그인한 뒤 다시 열어 주세요."
          title="로그인이 필요합니다"
        />
      </DashboardShell>
    );
  }

  return (
    <DashboardQueryBoundary
      fallback={
        <DashboardShell activeNavigationItem="calendar">
          <DashboardLoading label="활성 조직을 불러오는 중..." />
        </DashboardShell>
      }
      resetKeys={[currentUserId]}
      title="활성 조직을 불러오지 못했습니다"
    >
      <AuthenticatedCalendarRoute currentUserId={currentUserId} />
    </DashboardQueryBoundary>
  );
}

function AuthenticatedCalendarRoute({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const activeOrganization = useCalendarActiveOrganization().data;

  return (
    <DashboardShell
      activeNavigationItem="calendar"
      organizationName={activeOrganization?.organization.name}
    >
      {!activeOrganization ? (
        <DashboardState
          description="회의일정은 활성 조직 범위에서 동작합니다. 조직을 선택한 뒤 다시 열어 주세요."
          title="활성 조직이 없습니다"
        />
      ) : (
        <DashboardQueryBoundary
          fallback={<DashboardLoading label="회의일정을 불러오는 중..." />}
          resetKeys={[activeOrganization.organization.id]}
          title="회의일정을 불러오지 못했습니다"
        >
          <CalendarWorkspace
            currentUserId={currentUserId}
            organizationId={activeOrganization.organization.id}
          />
        </DashboardQueryBoundary>
      )}
    </DashboardShell>
  );
}

function CalendarWorkspace({
  currentUserId,
  organizationId,
}: {
  currentUserId: string;
  organizationId: string;
}) {
  const timeZone = useMemo(getSystemTimeZone, []);
  const today = useMemo(() => todayDateKey(timeZone), [timeZone]);
  const [currentDateKey, setCurrentDateKey] = useState(today);
  const [view, setView] = useState<CalendarViewMode>('month');
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [category, setCategory] = useState<CalendarCategory | 'all'>('all');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(
    null,
  );
  const [roomDialogOpen, setRoomDialogOpen] = useState(false);
  const [panelDialogOpen, setPanelDialogOpen] = useState(false);
  const [createRequest, setCreateRequest] =
    useState<CalendarCreateRequest | null>(null);
  const range = getCalendarQueryRange(view, currentDateKey, timeZone);
  const miniCalendarRange = getCalendarQueryRange(
    'month',
    currentDateKey,
    timeZone,
  );
  const roomTimelineRange = getCalendarQueryRange(
    'day',
    currentDateKey,
    timeZone,
  );
  const meetings = useCalendarMeetings(organizationId, {
    from: range.from,
    to: range.to,
    category,
    roomId: roomId ?? undefined,
    search: deferredSearch,
  }).data.items;
  const miniCalendarMeetings = useCalendarMeetings(organizationId, {
    from: miniCalendarRange.from,
    to: miniCalendarRange.to,
    category,
    roomId: roomId ?? undefined,
    search: deferredSearch,
  }).data.items;
  const roomTimelineMeetings = useCalendarMeetings(organizationId, {
    from: roomTimelineRange.from,
    to: roomTimelineRange.to,
    category: 'all',
    search: '',
  }).data.items;
  const rooms = useCalendarRooms(organizationId).data.items;

  const openCreate = (dateKey = currentDateKey, startTime?: string) => {
    setCreateRequest({ dateKey, startTime });
  };
  const openCreateRequest = (request: CalendarCreateRequest) => {
    setCreateRequest(request);
  };
  const selectDay = (dateKey: string) => {
    setCurrentDateKey(dateKey);
    setView('day');
  };

  return (
    <View className="min-h-0 flex-1 bg-background">
      <CalendarHeader
        onOpenCreate={() => openCreate()}
        onOpenPanel={() => setPanelDialogOpen(true)}
        onOpenRooms={() => setRoomDialogOpen(true)}
        onViewChange={setView}
        view={view}
      />
      <CalendarToolbar
        category={category}
        onCategoryChange={setCategory}
        onNext={() =>
          setCurrentDateKey((current) => shiftCalendarPeriod(current, view, 1))
        }
        onPrevious={() =>
          setCurrentDateKey((current) => shiftCalendarPeriod(current, view, -1))
        }
        onRoomChange={setRoomId}
        onSearchChange={setSearch}
        onToday={() => setCurrentDateKey(today)}
        periodTitle={range.title}
        roomId={roomId}
        rooms={rooms}
        search={search}
      />

      <View className="min-h-0 flex-1 flex-row overflow-hidden">
        <ScrollView
          className="hidden w-64 shrink-0 border-r border-border bg-muted/10 xl:flex"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
        >
          <CalendarMiniPanel
            currentDateKey={currentDateKey}
            meetings={miniCalendarMeetings}
            onOpenMeeting={setSelectedMeetingId}
            onOpenRooms={() => setRoomDialogOpen(true)}
            onSelectDate={setCurrentDateKey}
            rooms={rooms}
            timeZone={timeZone}
            todayDateKey={today}
          />
        </ScrollView>

        <ScrollView
          className="min-h-0 min-w-0 flex-1"
          contentContainerClassName="p-4 sm:p-6"
          showsVerticalScrollIndicator={false}
        >
          {view === 'month' ? (
            <CalendarMonthView
              currentDateKey={currentDateKey}
              meetings={meetings}
              onCreateMeeting={openCreate}
              onOpenMeeting={setSelectedMeetingId}
              onSelectDay={selectDay}
              timeZone={timeZone}
              todayDateKey={today}
            />
          ) : view === 'week' ? (
            <CalendarWeekView
              currentDateKey={currentDateKey}
              meetings={meetings}
              onCreateMeeting={openCreate}
              onOpenMeeting={setSelectedMeetingId}
              timeZone={timeZone}
              todayDateKey={today}
            />
          ) : view === 'day' ? (
            <CalendarDayView
              currentDateKey={currentDateKey}
              meetings={meetings}
              onCreateMeeting={openCreate}
              onOpenMeeting={setSelectedMeetingId}
              timeZone={timeZone}
              todayDateKey={today}
            />
          ) : (
            <CalendarListView
              meetings={meetings}
              onOpenMeeting={setSelectedMeetingId}
              timeZone={timeZone}
              todayDateKey={today}
            />
          )}
        </ScrollView>
      </View>

      <Dialog onOpenChange={setPanelDialogOpen} open={panelDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-sm xl:hidden">
          <DialogHeader>
            <DialogTitle className="text-sm">캘린더 탐색</DialogTitle>
          </DialogHeader>
          <ScrollView
            className="max-h-[72vh]"
            showsVerticalScrollIndicator={false}
          >
            <CalendarMiniPanel
              currentDateKey={currentDateKey}
              meetings={miniCalendarMeetings}
              onOpenMeeting={(meetingId) => {
                setPanelDialogOpen(false);
                setSelectedMeetingId(meetingId);
              }}
              onOpenRooms={() => {
                setPanelDialogOpen(false);
                setRoomDialogOpen(true);
              }}
              onSelectDate={(dateKey) => {
                setCurrentDateKey(dateKey);
                setPanelDialogOpen(false);
              }}
              rooms={rooms}
              timeZone={timeZone}
              todayDateKey={today}
            />
          </ScrollView>
        </DialogContent>
      </Dialog>

      <CalendarRoomsDialog
        currentDateKey={currentDateKey}
        meetings={roomTimelineMeetings}
        onCreateMeeting={openCreateRequest}
        onOpenChange={setRoomDialogOpen}
        open={roomDialogOpen}
        rooms={rooms}
        timeZone={timeZone}
      />
      <CalendarMeetingDetailDialog
        currentUserId={currentUserId}
        meetingId={selectedMeetingId}
        onOpenChange={(open) => !open && setSelectedMeetingId(null)}
        open={selectedMeetingId !== null}
        organizationId={organizationId}
        rooms={rooms}
      />
      {createRequest ? (
        <CalendarCreateDialog
          currentUserId={currentUserId}
          onCreated={(meeting) => setSelectedMeetingId(meeting.id)}
          onOpenChange={(open) => !open && setCreateRequest(null)}
          open
          organizationId={organizationId}
          request={createRequest}
          rooms={rooms}
          timeZone={timeZone}
        />
      ) : null}
    </View>
  );
}
