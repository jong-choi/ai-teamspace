export const UPSERT_TICKET = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (ticket:KGWorkOSTicket {key: $sourceKey})
SET ticket.organizationId = $organizationId,
    ticket.sourceId = $sourceId,
    ticket.projectId = $projectId,
    ticket.columnId = $columnId,
    ticket.number = $number,
    ticket.title = $title,
    ticket.priority = $priority,
    ticket.position = $position,
    ticket.dueAt = $dueAt,
    ticket.archivedAt = $archivedAt,
    ticket.sourceUpdatedAt = $sourceUpdatedAt,
    ticket.placeholder = false,
    ticket.deleted = false
WITH marker, ticket
OPTIONAL MATCH (ticket)-[oldRel]->()
WHERE type(oldRel) IN [
  'KG_TICKET_PROJECT',
  'KG_TICKET_COLUMN',
  'KG_TICKET_ASSIGNEE',
  'KG_TICKET_REPORTER',
  'KG_TICKET_LABEL',
  'KG_TICKET_CHECKLIST'
]
DELETE oldRel
WITH DISTINCT marker, ticket
OPTIONAL MATCH (oldChecklist:KGWorkOSTicketChecklist {organizationId: $organizationId, ticketId: $sourceId})
OPTIONAL MATCH (oldChecklist)-[oldItemRel:KG_CHECKLIST_ITEM]->()
SET oldChecklist.deleted = true
DELETE oldItemRel
WITH DISTINCT marker, ticket
OPTIONAL MATCH (oldItem:KGWorkOSTicketChecklistItem {organizationId: $organizationId, ticketId: $sourceId})
SET oldItem.deleted = true
WITH DISTINCT marker, ticket
MERGE (project:KGWorkOSProject {key: $projectKey})
ON CREATE SET project.organizationId = $organizationId,
              project.sourceId = $projectId,
              project.placeholder = true,
              project.deleted = false
MERGE (column:KGWorkOSProjectColumn {key: $columnKey})
ON CREATE SET column.organizationId = $organizationId,
              column.sourceId = $columnId,
              column.projectId = $projectId,
              column.placeholder = true,
              column.deleted = false
MERGE (ticket)-[:KG_TICKET_PROJECT]->(project)
MERGE (ticket)-[:KG_TICKET_COLUMN]->(column)
FOREACH (ignored IN CASE WHEN $assigneeKey IS NULL THEN [] ELSE [1] END |
  MERGE (assignee:KGWorkOSUserReference {key: $assigneeKey})
  ON CREATE SET assignee.organizationId = $organizationId,
                assignee.sourceId = $assigneeUserId
  MERGE (ticket)-[:KG_TICKET_ASSIGNEE]->(assignee)
)
MERGE (reporter:KGWorkOSUserReference {key: $reporterKey})
ON CREATE SET reporter.organizationId = $organizationId,
              reporter.sourceId = $reporterUserId
MERGE (ticket)-[:KG_TICKET_REPORTER]->(reporter)
FOREACH (label IN $labels |
  MERGE (labelNode:KGWorkOSTicketLabel {key: label.key})
  ON CREATE SET labelNode.organizationId = $organizationId,
                labelNode.sourceId = label.id,
                labelNode.projectId = $projectId,
                labelNode.placeholder = true,
                labelNode.deleted = false
  MERGE (ticket)-[:KG_TICKET_LABEL]->(labelNode)
)
FOREACH (checklist IN $checklists |
  MERGE (checklistNode:KGWorkOSTicketChecklist {key: checklist.key})
  SET checklistNode.organizationId = $organizationId,
      checklistNode.sourceId = checklist.id,
      checklistNode.ticketId = $sourceId,
      checklistNode.title = checklist.title,
      checklistNode.position = checklist.position,
      checklistNode.deleted = false
  MERGE (ticket)-[:KG_TICKET_CHECKLIST]->(checklistNode)
  FOREACH (item IN checklist.items |
    MERGE (itemNode:KGWorkOSTicketChecklistItem {key: item.key})
    SET itemNode.organizationId = $organizationId,
        itemNode.sourceId = item.id,
        itemNode.ticketId = $sourceId,
        itemNode.checklistId = checklist.id,
        itemNode.title = item.title,
        itemNode.completed = item.completed,
        itemNode.position = item.position,
        itemNode.deleted = false
    MERGE (checklistNode)-[:KG_CHECKLIST_ITEM]->(itemNode)
  )
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_TICKET = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (ticket:KGWorkOSTicket {key: $sourceKey})
OPTIONAL MATCH (ticket)-[ownedRel]->()
WHERE type(ownedRel) IN [
  'KG_TICKET_PROJECT',
  'KG_TICKET_COLUMN',
  'KG_TICKET_ASSIGNEE',
  'KG_TICKET_REPORTER',
  'KG_TICKET_LABEL',
  'KG_TICKET_CHECKLIST'
]
DELETE ownedRel
WITH DISTINCT marker, ticket
OPTIONAL MATCH (checklist:KGWorkOSTicketChecklist {organizationId: $organizationId, ticketId: $sourceId})
OPTIONAL MATCH (checklist)-[itemRel:KG_CHECKLIST_ITEM]->()
SET checklist.deleted = true
DELETE itemRel
WITH DISTINCT marker, ticket
OPTIONAL MATCH (item:KGWorkOSTicketChecklistItem {organizationId: $organizationId, ticketId: $sourceId})
SET item.deleted = true
WITH DISTINCT marker, ticket
FOREACH (ignored IN CASE WHEN ticket IS NULL THEN [] ELSE [1] END |
  SET ticket.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
