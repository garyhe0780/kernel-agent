CREATE TABLE "BuilderPlan" (
"id" TEXT NOT NULL PRIMARY KEY,
"workspaceId" TEXT NOT NULL,
"draftId" TEXT,
"draftVersion" INTEGER,
"content" JSONB NOT NULL,
"version" INTEGER NOT NULL DEFAULT 1,
"status" TEXT NOT NULL DEFAULT 'planning',
"updatedAt" DATETIME NOT NULL,
CONSTRAINT "BuilderPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "BuilderPlan_draftId_key" ON "BuilderPlan"("draftId");
CREATE INDEX "BuilderPlan_workspaceId_idx" ON "BuilderPlan"("workspaceId");
