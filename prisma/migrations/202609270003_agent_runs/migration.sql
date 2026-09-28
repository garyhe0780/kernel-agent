CREATE TABLE "AgentRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "agentCredentialId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "steps" JSONB NOT NULL,
  "receipts" JSONB NOT NULL DEFAULT '[]',
  "nextStep" INTEGER NOT NULL DEFAULT 0,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'queued' CHECK ("status" IN ('queued','waiting','completed','failed','cancelled')),
  "error" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "AgentRun_agentCredentialId_idempotencyKey_key" ON "AgentRun"("agentCredentialId", "idempotencyKey");
CREATE INDEX "AgentRun_status_updatedAt_idx" ON "AgentRun"("status", "updatedAt");
CREATE INDEX "AgentRun_workspaceId_agentCredentialId_idx" ON "AgentRun"("workspaceId", "agentCredentialId");
