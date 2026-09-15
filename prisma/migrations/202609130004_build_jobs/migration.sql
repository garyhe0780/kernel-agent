CREATE TABLE "BuildJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "workspaceId" TEXT NOT NULL,
  "planId" TEXT NOT NULL, "planVersion" INTEGER NOT NULL, "createdBy" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued', "input" JSONB NOT NULL,
  "checkpoints" JSONB NOT NULL, "events" JSONB NOT NULL, "task" TEXT NOT NULL DEFAULT 'structure',
  "error" JSONB, "leaseToken" TEXT, "leaseUntil" DATETIME, "draftId" TEXT,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "BuildJob_planId_planVersion_key" ON "BuildJob"("planId", "planVersion");
CREATE INDEX "BuildJob_workspaceId_planId_idx" ON "BuildJob"("workspaceId", "planId");
CREATE INDEX "BuildJob_status_leaseUntil_idx" ON "BuildJob"("status", "leaseUntil");
