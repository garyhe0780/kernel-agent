ALTER TABLE "Project" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
CREATE TABLE "ProjectDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "brief" TEXT NOT NULL,
  "definition" JSONB NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "source" TEXT NOT NULL,
  "projectSlug" TEXT,
  "publishedVersion" INTEGER,
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "ProjectDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProjectDraft_workspaceId_status_idx" ON "ProjectDraft"("workspaceId", "status");
