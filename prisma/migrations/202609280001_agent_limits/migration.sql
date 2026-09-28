CREATE TABLE "AgentModelCall" (
  "id" TEXT PRIMARY KEY,
  "credentialId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AgentModelCall_credentialId_createdAt_idx" ON "AgentModelCall"("credentialId", "createdAt");
CREATE INDEX "AgentModelCall_requestId_idx" ON "AgentModelCall"("requestId");
CREATE TABLE "AgentWorkerHealth" (
  "id" TEXT PRIMARY KEY,
  "lastSuccessAt" TIMESTAMP(3),
  "lastFailureAt" TIMESTAMP(3)
);
CREATE INDEX "ChangeSet_agentCredentialId_createdAt_idx" ON "ChangeSet"("agentCredentialId", "createdAt");
