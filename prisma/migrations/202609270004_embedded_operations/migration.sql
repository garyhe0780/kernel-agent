CREATE TABLE "EmbeddedOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "userId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "request" JSONB NOT NULL,
  "plan" JSONB,
  "leaseToken" TEXT,
  "leaseUntil" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "EmbeddedOperation_workspaceId_userId_idempotencyKey_key" ON "EmbeddedOperation"("workspaceId", "userId", "idempotencyKey");
