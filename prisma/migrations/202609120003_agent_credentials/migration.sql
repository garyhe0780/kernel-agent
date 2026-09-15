ALTER TABLE "ChangeSet" ADD COLUMN "agentCredentialId" TEXT;
CREATE TABLE "AgentCredential" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "projectSlug" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "createdBy" TEXT NOT NULL,
  "actions" JSONB NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "revokedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "AgentCredential_tokenHash_key" ON "AgentCredential"("tokenHash");
CREATE INDEX "AgentCredential_workspaceId_projectSlug_idx" ON "AgentCredential"("workspaceId", "projectSlug");
