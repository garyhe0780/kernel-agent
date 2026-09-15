ALTER TABLE "Project" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Project" ADD COLUMN "definition" JSONB;
ALTER TABLE "ProjectDraft" ADD COLUMN "baseProjectVersion" INTEGER;
ALTER TABLE "ProjectDraft" ADD COLUMN "preview" JSONB;
CREATE TABLE "ProjectVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "definition" JSONB NOT NULL,
  "migration" JSONB NOT NULL,
  "publishedBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectVersion_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProjectVersion_projectId_version_key" ON "ProjectVersion"("projectId", "version");
UPDATE "Project" SET "definition" = (
  SELECT "definition" FROM "ProjectDraft"
  WHERE "ProjectDraft"."workspaceId" = "Project"."workspaceId"
    AND "ProjectDraft"."projectSlug" = "Project"."slug" AND "ProjectDraft"."status" = 'published'
  ORDER BY "updatedAt" DESC LIMIT 1
);
INSERT INTO "ProjectVersion" ("id", "projectId", "version", "definition", "migration", "publishedBy", "createdAt")
SELECT "Project"."id" || '-v1', "Project"."id", 1, "Project"."definition", '{"kind":"initial"}',
  (SELECT "createdBy" FROM "ProjectDraft" WHERE "ProjectDraft"."workspaceId" = "Project"."workspaceId" AND "ProjectDraft"."projectSlug" = "Project"."slug" AND "ProjectDraft"."status" = 'published' LIMIT 1),
  "Project"."createdAt"
FROM "Project" WHERE "definition" IS NOT NULL;
