ALTER TABLE "AgentRun" DROP CONSTRAINT "AgentRun_userId_idempotencyKey_unique";--> statement-breakpoint
ALTER TABLE "AgentRun" ADD COLUMN "scopeKey" varchar(128) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_scopeKey_idempotencyKey_unique" UNIQUE("userId","scopeKey","idempotencyKey");