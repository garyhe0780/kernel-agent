CREATE TABLE "AccessGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AccessGroup_workspaceId_projectId_idx" ON "AccessGroup"("workspaceId", "projectId");
CREATE TABLE "AccessGroupMember" (
  "groupId" TEXT NOT NULL REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "membershipId" TEXT NOT NULL REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  PRIMARY KEY ("groupId", "membershipId")
);
CREATE INDEX "AccessGroupMember_membershipId_idx" ON "AccessGroupMember"("membershipId");
CREATE TABLE "AccessPolicy" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "groupId" TEXT NOT NULL REFERENCES "AccessGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "projectId" TEXT REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "role" TEXT NOT NULL CHECK ("role" IN ('owner', 'operator')),
  CHECK ("projectId" IS NULL OR "role" = 'operator')
);
CREATE INDEX "AccessPolicy_groupId_idx" ON "AccessPolicy"("groupId");
