import { useDeferredValue, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@repo/client/rnr/components/ui/dialog';
import { cn } from '@repo/client/rnr/lib/utils';
import { useDashboardPlatform } from '@core/app/platform/dashboard-platform';
import { DashboardShell } from '@core/app/shell/dashboard-shell';
import {
  DashboardLoading,
  DashboardQueryBoundary,
  DashboardState,
} from '@core/app/state/dashboard-query-state';
import { DIALOG_WIDTH } from '@core/app/ui/dialog-width';
import { AuthenticationRequiredState } from '@core/features/auth/authentication-required-state';
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
        <AuthenticationRequiredState />
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
        <CalendarWorkspace
          currentUserId={currentUserId}
          organizationId={activeOrganization.organization.id}
        />
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

  const meetingViewProps = {
    view,
    currentDateKey,
    onCreateMeeting: openCreate,
    onOpenMeeting: setSelectedMeetingId,
    onSelectDay: selectDay,
    timeZone,
    todayDateKey: today,
  };
  const miniPanelProps = {
    organizationId,
    currentDateKey,
    onOpenMeeting: setSelectedMeetingId,
    onOpenRooms: () => setRoomDialogOpen(true),
    onSelectDate: setCurrentDateKey,
    timeZone,
    todayDateKey: today,
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
        organizationId={organizationId}
        search={search}
      />

      <View className="min-h-0 flex-1 flex-row overflow-hidden">
        <ScrollView
          className="hidden w-64 shrink-0 border-r border-border bg-muted/10 xl:flex"
          contentContainerClassName="p-4"
          showsVerticalScrollIndicator={false}
        >
          <DashboardQueryBoundary
            fallback={
              <CalendarMiniPanel
                {...miniPanelProps}
                meetings={[]}
                rooms={[]}
                loading
              />
            }
            resetKeys={[organizationId, miniCalendarRange.from]}
            title="보조 일정을 불러오지 못했습니다"
          >
            <CalendarMiniPanelContent
              {...miniPanelProps}
              organizationId={organizationId}
              range={miniCalendarRange}
              category={category}
              roomId={roomId}
              search={deferredSearch}
            />
          </DashboardQueryBoundary>
        </ScrollView>

        <ScrollView
          className="min-h-0 min-w-0 flex-1"
          contentContainerClassName="p-4 sm:p-6"
          showsVerticalScrollIndicator={false}
        >
          <DashboardQueryBoundary
            fallback={
              <CalendarMeetingViews
                {...meetingViewProps}
                meetings={[]}
                loading
              />
            }
            resetKeys={[
              organizationId,
              range.from,
              range.to,
              category,
              roomId,
              deferredSearch,
            ]}
            title="회의일정을 불러오지 못했습니다"
          >
            <CalendarMeetingContent
              {...meetingViewProps}
              organizationId={organizationId}
              range={range}
              category={category}
              roomId={roomId}
              search={deferredSearch}
            />
          </DashboardQueryBoundary>
        </ScrollView>
      </View>

      <Dialog onOpenChange={setPanelDialogOpen} open={panelDialogOpen}>
        <DialogContent
          className={cn('max-h-[90vh] xl:hidden', DIALOG_WIDTH.sm)}
        >
          <DialogHeader>
            <DialogTitle className="text-sm">캘린더 탐색</DialogTitle>
          </DialogHeader>
          <ScrollView
            className="max-h-[72vh]"
            showsVerticalScrollIndicator={false}
          >
            <DashboardQueryBoundary
              fallback={
                <CalendarMiniPanel
                  {...miniPanelProps}
                  meetings={[]}
                  rooms={[]}
                  loading
                />
              }
              resetKeys={[organizationId, miniCalendarRange.from]}
              title="보조 일정을 불러오지 못했습니다"
            >
              {panelDialogOpen ? (
                <CalendarMiniPanelContent
                  {...miniPanelProps}
                  organizationId={organizationId}
                  range={miniCalendarRange}
                  category={category}
                  roomId={roomId}
                  search={deferredSearch}
                />
              ) : null}
            </DashboardQueryBoundary>
          </ScrollView>
        </DialogContent>
      </Dialog>

      {roomDialogOpen || selectedMeetingId || createRequest ? (
        <DashboardQueryBoundary
          fallback={
            <Dialog
              open
              onOpenChange={() => {
                setRoomDialogOpen(false);
                setSelectedMeetingId(null);
                setCreateRequest(null);
              }}
            >
              <DialogContent className={DIALOG_WIDTH.lg}>
                <DashboardLoading label="회의 화면을 준비하는 중..." />
              </DialogContent>
            </Dialog>
          }
          resetKeys={[organizationId]}
          title="회의실 정보를 불러오지 못했습니다"
        >
          <CalendarDialogs
            organizationId={organizationId}
            currentDateKey={currentDateKey}
            timeZone={timeZone}
            currentUserId={currentUserId}
            roomDialogOpen={roomDialogOpen}
            setRoomDialogOpen={setRoomDialogOpen}
            selectedMeetingId={selectedMeetingId}
            setSelectedMeetingId={setSelectedMeetingId}
            createRequest={createRequest}
            setCreateRequest={setCreateRequest}
            openCreateRequest={openCreateRequest}
          />
        </DashboardQueryBoundary>
      ) : null}
    </View>
  );
}

function CalendarMeetingViews({
  view,
  ...props
}: React.ComponentProps<typeof CalendarMonthView> & {
  view: CalendarViewMode;
}) {
  if (view === 'month') return <CalendarMonthView {...props} />;
  if (view === 'week') return <CalendarWeekView {...props} />;
  if (view === 'day') return <CalendarDayView {...props} />;
  if (props.loading)
    return <DashboardLoading label="회의 일정을 불러오는 중..." />;
  return <CalendarListView {...props} />;
}

function CalendarMeetingContent({
  organizationId,
  range,
  category,
  roomId,
  search,
  ...props
}: Omit<React.ComponentProps<typeof CalendarMeetingViews>, 'meetings'> & {
  organizationId: string;
  range: ReturnType<typeof getCalendarQueryRange>;
  category: CalendarCategory | 'all';
  roomId: string | null;
  search: string;
}) {
  const meetings = useCalendarMeetings(organizationId, {
    from: range.from,
    to: range.to,
    category,
    roomId: roomId ?? undefined,
    search,
  }).data.items;
  return <CalendarMeetingViews {...props} meetings={meetings} />;
}

function CalendarMiniPanelContent({
  organizationId,
  range,
  category,
  roomId,
  search,
  ...props
}: Omit<
  React.ComponentProps<typeof CalendarMiniPanel>,
  'meetings' | 'rooms'
> & {
  organizationId: string;
  range: ReturnType<typeof getCalendarQueryRange>;
  category: CalendarCategory | 'all';
  roomId: string | null;
  search: string;
}) {
  const meetings = useCalendarMeetings(organizationId, {
    from: range.from,
    to: range.to,
    category,
    roomId: roomId ?? undefined,
    search,
  }).data.items;
  return (
    <CalendarMiniPanel
      {...props}
      organizationId={organizationId}
      meetings={meetings}
      rooms={[]}
    />
  );
}

function CalendarDialogs({
  organizationId,
  currentDateKey,
  timeZone,
  currentUserId,
  roomDialogOpen,
  setRoomDialogOpen,
  selectedMeetingId,
  setSelectedMeetingId,
  createRequest,
  setCreateRequest,
  openCreateRequest,
}: {
  organizationId: string;
  currentDateKey: string;
  timeZone: string;
  currentUserId: string;
  roomDialogOpen: boolean;
  setRoomDialogOpen: (value: boolean) => void;
  selectedMeetingId: string | null;
  setSelectedMeetingId: (value: string | null) => void;
  createRequest: CalendarCreateRequest | null;
  setCreateRequest: (value: CalendarCreateRequest | null) => void;
  openCreateRequest: (value: CalendarCreateRequest) => void;
}) {
  const rooms = useCalendarRooms(organizationId).data.items;
  return (
    <>
      {roomDialogOpen ? (
        <DashboardQueryBoundary
          fallback={
            <Dialog open onOpenChange={setRoomDialogOpen}>
              <DialogContent className={DIALOG_WIDTH['4xl']}>
                <DashboardLoading label="회의실 일정을 불러오는 중..." />
              </DialogContent>
            </Dialog>
          }
          resetKeys={[organizationId, currentDateKey]}
          title="회의실 일정을 불러오지 못했습니다"
        >
          <CalendarRoomsContent
            organizationId={organizationId}
            currentDateKey={currentDateKey}
            rooms={rooms}
            timeZone={timeZone}
            open
            onOpenChange={setRoomDialogOpen}
            onCreateMeeting={openCreateRequest}
          />
        </DashboardQueryBoundary>
      ) : null}
      {selectedMeetingId ? (
        <CalendarMeetingDetailDialog
          currentUserId={currentUserId}
          meetingId={selectedMeetingId}
          onOpenChange={(open) => !open && setSelectedMeetingId(null)}
          open
          organizationId={organizationId}
          rooms={rooms}
        />
      ) : null}
      {createRequest ? (
        <CalendarCreateDialog
          key={JSON.stringify(createRequest)}
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
    </>
  );
}

function CalendarRoomsContent({
  organizationId,
  ...props
}: Omit<React.ComponentProps<typeof CalendarRoomsDialog>, 'meetings'> & {
  organizationId: string;
}) {
  const range = getCalendarQueryRange(
    'day',
    props.currentDateKey,
    props.timeZone,
  );
  const meetings = useCalendarMeetings(organizationId, {
    from: range.from,
    to: range.to,
    category: 'all',
    search: '',
  }).data.items;
  return <CalendarRoomsDialog {...props} meetings={meetings} />;
}
