CREATE TABLE IF NOT EXISTS "PortfolioPriceHistory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolioId" uuid NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"source" varchar(40) NOT NULL,
	"adjustmentBasis" varchar NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"asOf" date NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "PortfolioPriceHistory_portfolioId_ticker_source_adjustmentBasis_asOf_unique" UNIQUE("portfolioId","ticker","source","adjustmentBasis","asOf")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PortfolioPricePoint" (
	"historyId" uuid NOT NULL,
	"date" date NOT NULL,
	"price" double precision NOT NULL,
	CONSTRAINT "PortfolioPricePoint_historyId_date_pk" PRIMARY KEY("historyId","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PortfolioSnapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolioId" uuid NOT NULL,
	"source" varchar(40) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"adjustmentBasis" varchar NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"asOf" date NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PortfolioSnapshotHolding" (
	"snapshotId" uuid NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"shares" double precision NOT NULL,
	"costBasis" double precision,
	"price" double precision NOT NULL,
	CONSTRAINT "PortfolioSnapshotHolding_snapshotId_ticker_pk" PRIMARY KEY("snapshotId","ticker")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PortfolioPriceHistory" ADD CONSTRAINT "PortfolioPriceHistory_portfolioId_Portfolio_id_fk" FOREIGN KEY ("portfolioId") REFERENCES "public"."Portfolio"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PortfolioPricePoint" ADD CONSTRAINT "PortfolioPricePoint_historyId_PortfolioPriceHistory_id_fk" FOREIGN KEY ("historyId") REFERENCES "public"."PortfolioPriceHistory"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PortfolioSnapshot" ADD CONSTRAINT "PortfolioSnapshot_portfolioId_Portfolio_id_fk" FOREIGN KEY ("portfolioId") REFERENCES "public"."Portfolio"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PortfolioSnapshotHolding" ADD CONSTRAINT "PortfolioSnapshotHolding_snapshotId_PortfolioSnapshot_id_fk" FOREIGN KEY ("snapshotId") REFERENCES "public"."PortfolioSnapshot"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
