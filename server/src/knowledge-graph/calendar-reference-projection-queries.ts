export const UPSERT_MEETING_ROOM = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker WHERE marker.appliedSeq < $sourceVersion
MERGE (room:KGWorkOSMeetingRoom {key: $sourceKey})
SET room.organizationId = $organizationId, room.sourceId = $sourceId,
    room.name = $name, room.capacity = $capacity, room.floor = $floor,
    room.active = $active, room.sourceUpdatedAt = $sourceUpdatedAt,
    room.placeholder = false, room.deleted = false
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_MEETING_ROOM = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (room:KGWorkOSMeetingRoom {key: $sourceKey})
FOREACH (ignored IN CASE WHEN room IS NULL THEN [] ELSE [1] END |
  SET room.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;

export const UPSERT_MEETING_RECURRENCE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker WHERE marker.appliedSeq < $sourceVersion
MERGE (series:KGWorkOSMeetingRecurrence {key: $sourceKey})
SET series.organizationId = $organizationId, series.sourceId = $sourceId,
    series.frequency = $frequency, series.interval = $interval,
    series.count = $count, series.until = $until,
    series.byWeekday = $byWeekday, series.timeZone = $timeZone,
    series.sourceUpdatedAt = $sourceUpdatedAt,
    series.placeholder = false, series.deleted = false
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_MEETING_RECURRENCE = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (series:KGWorkOSMeetingRecurrence {key: $sourceKey})
FOREACH (ignored IN CASE WHEN series IS NULL THEN [] ELSE [1] END |
  SET series.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
