CREATE TABLE IF NOT EXISTS "AgentRun" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"workflowType" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"input" json NOT NULL,
	"result" json,
	"error" text,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "AgentRunStep" (
	"runId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"result" json,
	"error" text,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone,
	CONSTRAINT "AgentRunStep_runId_name_pk" PRIMARY KEY("runId","name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_AgentRun_id_fk" FOREIGN KEY ("runId") REFERENCES "public"."AgentRun"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentRun_userId_createdAt_id_index" ON "AgentRun" USING btree ("userId","createdAt","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "AgentRun_expiresAt_index" ON "AgentRun" USING btree ("expiresAt");