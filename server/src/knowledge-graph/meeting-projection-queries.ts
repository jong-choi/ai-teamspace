export const UPSERT_MEETING = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (meeting:KGWorkOSMeeting {key: $sourceKey})
SET meeting.organizationId = $organizationId,
    meeting.sourceId = $sourceId,
    meeting.projectReference = $projectReference,
    meeting.title = $title,
    meeting.category = $category,
    meeting.startAt = $startAt,
    meeting.endAt = $endAt,
    meeting.timeZone = $timeZone,
    meeting.locationType = $locationType,
    meeting.locationText = $locationText,
    meeting.reminderMinutes = $reminderMinutes,
    meeting.canceledAt = $canceledAt,
    meeting.sourceUpdatedAt = $sourceUpdatedAt,
    meeting.deleted = false
WITH marker, meeting
OPTIONAL MATCH (meeting)-[oldRel]->()
WHERE type(oldRel) IN [
  'KG_MEETING_ROOM',
  'KG_MEETING_RECURRENCE',
  'KG_MEETING_ORGANIZER',
  'KG_MEETING_ATTENDEE'
]
DELETE oldRel
WITH marker, meeting
MERGE (organizer:KGWorkOSUserReference {key: $organizerKey})
ON CREATE SET organizer.organizationId = $organizationId,
              organizer.sourceId = $organizerUserId
MERGE (meeting)-[:KG_MEETING_ORGANIZER]->(organizer)
FOREACH (ignored IN CASE WHEN $roomKey IS NULL THEN [] ELSE [1] END |
  MERGE (room:KGWorkOSMeetingRoom {key: $roomKey})
  ON CREATE SET room.organizationId = $organizationId,
                room.sourceId = $roomId,
                room.placeholder = true,
                room.deleted = false
  MERGE (meeting)-[:KG_MEETING_ROOM]->(room)
)
FOREACH (ignored IN CASE WHEN $recurrenceKey IS NULL THEN [] ELSE [1] END |
  MERGE (series:KGWorkOSMeetingRecurrence {key: $recurrenceKey})
  SET series.organizationId = $organizationId,
      series.sourceId = $recurrenceId,
      series.frequency = $recurrenceFrequency,
      series.interval = $recurrenceInterval,
      series.count = $recurrenceCount,
      series.until = $recurrenceUntil,
      series.timeZone = $recurrenceTimeZone,
      series.deleted = false
  MERGE (meeting)-[:KG_MEETING_RECURRENCE]->(series)
)
FOREACH (attendee IN $attendees |
  MERGE (user:KGWorkOSUserReference {key: attendee.key})
  ON CREATE SET user.organizationId = $organizationId,
                user.sourceId = attendee.userId
  MERGE (meeting)-[relation:KG_MEETING_ATTENDEE]->(user)
  SET relation.status = attendee.status
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_MEETING = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (meeting:KGWorkOSMeeting {key: $sourceKey})
OPTIONAL MATCH (meeting)-[ownedRel]->()
WHERE type(ownedRel) IN [
  'KG_MEETING_ROOM',
  'KG_MEETING_RECURRENCE',
  'KG_MEETING_ORGANIZER',
  'KG_MEETING_ATTENDEE'
]
DELETE ownedRel
WITH marker, meeting
FOREACH (ignored IN CASE WHEN meeting IS NULL THEN [] ELSE [1] END |
  SET meeting.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
