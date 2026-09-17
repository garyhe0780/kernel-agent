-- AlterTable
ALTER TABLE "AgentCredential" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'operate';

-- AlterTable
ALTER TABLE "AgentCredential" ALTER COLUMN "projectSlug" DROP NOT NULL;
