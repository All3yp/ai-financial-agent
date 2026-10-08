ALTER TABLE "AgentRun" ADD COLUMN "idempotencyKey" varchar(128);--> statement-breakpoint
UPDATE "AgentRun" SET "idempotencyKey" = gen_random_uuid()::varchar WHERE "idempotencyKey" IS NULL;--> statement-breakpoint
ALTER TABLE "AgentRun" ALTER COLUMN "idempotencyKey" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_idempotencyKey_unique" UNIQUE("userId","idempotencyKey");