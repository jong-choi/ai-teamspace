export const UPSERT_MEMBERSHIP = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
MERGE (membership:KGWorkOSMembership {key: $sourceKey})
SET membership.organizationId = $organizationId,
    membership.userId = $userId,
    membership.role = $role,
    membership.createdAt = $createdAt,
    membership.deleted = false
WITH marker, membership
OPTIONAL MATCH (membership)-[oldRel]->()
WHERE type(oldRel) IN ['KG_MEMBERSHIP_ORGANIZATION', 'KG_MEMBERSHIP_USER']
DELETE oldRel
WITH DISTINCT marker, membership
MERGE (organization:KGWorkOSOrganization {key: $organizationKey})
ON CREATE SET organization.organizationId = $organizationId,
              organization.sourceId = $organizationId,
              organization.deleted = false,
              organization.placeholder = true
MERGE (user:KGWorkOSUserReference {key: $userKey})
ON CREATE SET user.organizationId = $organizationId,
              user.sourceId = $userId
MERGE (membership)-[:KG_MEMBERSHIP_ORGANIZATION]->(organization)
MERGE (membership)-[:KG_MEMBERSHIP_USER]->(user)
SET marker.appliedSeq = $sourceVersion, marker.deleted = false
RETURN marker.appliedSeq AS appliedSeq
`;

export const TOMBSTONE_MEMBERSHIP = `
MERGE (marker:KGProjectionSource {key: $sourceKey})
ON CREATE SET marker.appliedSeq = 0
SET marker.writeFence = coalesce(marker.writeFence, 0) + 1
WITH marker
WHERE marker.appliedSeq < $sourceVersion
OPTIONAL MATCH (membership:KGWorkOSMembership {key: $sourceKey})
OPTIONAL MATCH (membership)-[ownedRel]->()
WHERE type(ownedRel) IN ['KG_MEMBERSHIP_ORGANIZATION', 'KG_MEMBERSHIP_USER']
DELETE ownedRel
WITH DISTINCT marker, membership
FOREACH (ignored IN CASE WHEN membership IS NULL THEN [] ELSE [1] END |
  SET membership.deleted = true
)
SET marker.appliedSeq = $sourceVersion, marker.deleted = true
RETURN marker.appliedSeq AS appliedSeq
`;
