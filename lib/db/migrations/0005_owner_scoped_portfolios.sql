CREATE TABLE IF NOT EXISTS "Portfolio" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PortfolioHolding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portfolioId" uuid NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"shares" double precision NOT NULL,
	"costBasis" double precision,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "PortfolioHolding_portfolioId_ticker_unique" UNIQUE("portfolioId","ticker")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Watchlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "WatchlistTicker" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"watchlistId" uuid NOT NULL,
	"ticker" varchar(20) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "WatchlistTicker_watchlistId_ticker_unique" UNIQUE("watchlistId","ticker")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PortfolioHolding" ADD CONSTRAINT "PortfolioHolding_portfolioId_Portfolio_id_fk" FOREIGN KEY ("portfolioId") REFERENCES "public"."Portfolio"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Watchlist" ADD CONSTRAINT "Watchlist_userId_User_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "WatchlistTicker" ADD CONSTRAINT "WatchlistTicker_watchlistId_Watchlist_id_fk" FOREIGN KEY ("watchlistId") REFERENCES "public"."Watchlist"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
