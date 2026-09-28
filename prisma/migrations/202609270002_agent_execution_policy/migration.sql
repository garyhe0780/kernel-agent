ALTER TABLE "ChangeSet" ADD COLUMN "executionMode" TEXT NOT NULL DEFAULT 'review';
ALTER TABLE "ChangeSet" ADD CONSTRAINT "ChangeSet_executionMode_check" CHECK ("executionMode" IN ('review', 'automatic'));
