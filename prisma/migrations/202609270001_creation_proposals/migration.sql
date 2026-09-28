ALTER TABLE "ChangeSet" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'action';
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_kind_check" CHECK ("kind" IN ('action', 'create'));
