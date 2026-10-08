ALTER TABLE "Portfolio" ADD COLUMN "monitoringFrequency" varchar DEFAULT 'daily' NOT NULL;--> statement-breakpoint
ALTER TABLE "Portfolio" ADD COLUMN "monitoringTime" varchar(5) DEFAULT '09:00' NOT NULL;--> statement-breakpoint
ALTER TABLE "Portfolio" ADD COLUMN "monitoringTimezone" varchar(64) DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "Portfolio" ADD COLUMN "monitoringDayOfWeek" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "Portfolio" ADD COLUMN "monitoringDayOfMonth" integer DEFAULT 1 NOT NULL;