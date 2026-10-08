import type { InferSelectModel } from 'drizzle-orm';
import {
  pgTable,
  varchar,
  timestamp,
  json,
  uuid,
  text,
  primaryKey,
  foreignKey,
  boolean,
  doublePrecision,
  unique,
  date,
  index,
} from 'drizzle-orm/pg-core';

export const user = pgTable('User', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  email: varchar('email', { length: 64 }).notNull(),
  password: varchar('password', { length: 64 }),
});

export type User = InferSelectModel<typeof user>;

export const chat = pgTable('Chat', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  createdAt: timestamp('createdAt').notNull(),
  title: text('title').notNull(),
  userId: uuid('userId')
    .notNull()
    .references(() => user.id),
  visibility: varchar('visibility', { enum: ['public', 'private'] })
    .notNull()
    .default('private'),
});

export type Chat = InferSelectModel<typeof chat>;

export const message = pgTable('Message', {
  id: uuid('id').primaryKey().notNull().defaultRandom(),
  chatId: uuid('chatId')
    .notNull()
    .references(() => chat.id),
  role: varchar('role').notNull(),
  content: json('content').notNull(),
  createdAt: timestamp('createdAt').notNull(),
});

export type Message = InferSelectModel<typeof message>;

export const vote = pgTable(
  'Vote',
  {
    chatId: uuid('chatId')
      .notNull()
      .references(() => chat.id),
    messageId: uuid('messageId')
      .notNull()
      .references(() => message.id),
    isUpvoted: boolean('isUpvoted').notNull(),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.chatId, table.messageId] }),
    };
  },
);

export type Vote = InferSelectModel<typeof vote>;

export const document = pgTable(
  'Document',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdAt: timestamp('createdAt').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    kind: varchar('text', { enum: ['text', 'code'] })
      .notNull()
      .default('text'),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
  },
  (table) => {
    return {
      pk: primaryKey({ columns: [table.id, table.createdAt] }),
    };
  },
);

export type Document = InferSelectModel<typeof document>;

export const suggestion = pgTable(
  'Suggestion',
  {
    id: uuid('id').notNull().defaultRandom(),
    documentId: uuid('documentId').notNull(),
    documentCreatedAt: timestamp('documentCreatedAt').notNull(),
    originalText: text('originalText').notNull(),
    suggestedText: text('suggestedText').notNull(),
    description: text('description'),
    isResolved: boolean('isResolved').notNull().default(false),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id),
    createdAt: timestamp('createdAt').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id] }),
    documentRef: foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [document.id, document.createdAt],
    }),
  }),
);

export type Suggestion = InferSelectModel<typeof suggestion>;

export const portfolio = pgTable(
  'Portfolio',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    userNameUnique: unique().on(table.userId, table.name),
  }),
);

export type Portfolio = InferSelectModel<typeof portfolio>;

export const portfolioHolding = pgTable(
  'PortfolioHolding',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    portfolioId: uuid('portfolioId')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    shares: doublePrecision('shares').notNull(),
    costBasis: doublePrecision('costBasis'),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    portfolioTickerUnique: unique().on(table.portfolioId, table.ticker),
  }),
);

export type PortfolioHolding = InferSelectModel<typeof portfolioHolding>;

export const watchlist = pgTable(
  'Watchlist',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
    updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  },
  (table) => ({
    userNameUnique: unique().on(table.userId, table.name),
  }),
);

export type Watchlist = InferSelectModel<typeof watchlist>;

export const watchlistTicker = pgTable(
  'WatchlistTicker',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    watchlistId: uuid('watchlistId')
      .notNull()
      .references(() => watchlist.id, { onDelete: 'cascade' }),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    createdAt: timestamp('createdAt').notNull().defaultNow(),
  },
  (table) => ({
    watchlistTickerUnique: unique().on(table.watchlistId, table.ticker),
  }),
);

export type WatchlistTicker = InferSelectModel<typeof watchlistTicker>;

export const portfolioSnapshot = pgTable(
  'PortfolioSnapshot',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    portfolioId: uuid('portfolioId')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    source: varchar('source', { length: 40 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    adjustmentBasis: varchar('adjustmentBasis', {
      enum: ['unadjusted', 'split-adjusted', 'total-return', 'unknown'],
    }).notNull(),
    observedAt: timestamp('observedAt', { withTimezone: true }).notNull(),
    asOf: date('asOf').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    portfolioCapturedIdx: index().on(
      table.portfolioId,
      table.createdAt,
      table.id,
    ),
  }),
);

export type PortfolioSnapshot = InferSelectModel<typeof portfolioSnapshot>;

export const portfolioSnapshotHolding = pgTable(
  'PortfolioSnapshotHolding',
  {
    snapshotId: uuid('snapshotId')
      .notNull()
      .references(() => portfolioSnapshot.id, { onDelete: 'cascade' }),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    shares: doublePrecision('shares').notNull(),
    costBasis: doublePrecision('costBasis'),
    price: doublePrecision('price').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.snapshotId, table.ticker] }),
  }),
);

export type PortfolioSnapshotHolding = InferSelectModel<
  typeof portfolioSnapshotHolding
>;

export const portfolioPriceHistory = pgTable(
  'PortfolioPriceHistory',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    portfolioId: uuid('portfolioId')
      .notNull()
      .references(() => portfolio.id, { onDelete: 'cascade' }),
    ticker: varchar('ticker', { length: 20 }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull(),
    source: varchar('source', { length: 40 }).notNull(),
    adjustmentBasis: varchar('adjustmentBasis', {
      enum: ['unadjusted', 'split-adjusted', 'total-return', 'unknown'],
    }).notNull(),
    observedAt: timestamp('observedAt', { withTimezone: true }).notNull(),
    asOf: date('asOf').notNull(),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    seriesUnique: unique().on(table.portfolioId, table.ticker, table.source),
    portfolioTickerAsOfIdx: index().on(
      table.portfolioId,
      table.ticker,
      table.asOf,
    ),
  }),
);

export type PortfolioPriceHistory = InferSelectModel<
  typeof portfolioPriceHistory
>;

export const portfolioPricePoint = pgTable(
  'PortfolioPricePoint',
  {
    historyId: uuid('historyId')
      .notNull()
      .references(() => portfolioPriceHistory.id, { onDelete: 'cascade' }),
    date: date('date').notNull(),
    price: doublePrecision('price').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.historyId, table.date] }),
  }),
);

export type PortfolioPricePoint = InferSelectModel<typeof portfolioPricePoint>;

export const agentRun = pgTable(
  'AgentRun',
  {
    id: uuid('id').primaryKey().notNull().defaultRandom(),
    userId: uuid('userId')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    workflowType: varchar('workflowType', {
      enum: ['analysis', 'debate', 'screening', 'monitoring'],
    }).notNull(),
    idempotencyKey: varchar('idempotencyKey', { length: 128 }).notNull(),
    status: varchar('status', {
      enum: ['pending', 'running', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    input: json('input').notNull(),
    result: json('result'),
    error: text('error'),
    createdAt: timestamp('createdAt', { withTimezone: true })
      .notNull()
      .defaultNow(),
    startedAt: timestamp('startedAt', { withTimezone: true }),
    completedAt: timestamp('completedAt', { withTimezone: true }),
    expiresAt: timestamp('expiresAt', { withTimezone: true }).notNull(),
  },
  (table) => ({
    ownerCreatedIdx: index().on(table.userId, table.createdAt, table.id),
    expiryIdx: index().on(table.expiresAt),
    ownerIdempotencyUnique: unique().on(table.userId, table.idempotencyKey),
  }),
);

export type AgentRun = InferSelectModel<typeof agentRun>;

export const agentRunStep = pgTable(
  'AgentRunStep',
  {
    runId: uuid('runId')
      .notNull()
      .references(() => agentRun.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    status: varchar('status', {
      enum: ['pending', 'running', 'completed', 'failed'],
    })
      .notNull()
      .default('pending'),
    result: json('result'),
    error: text('error'),
    startedAt: timestamp('startedAt', { withTimezone: true }),
    completedAt: timestamp('completedAt', { withTimezone: true }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.runId, table.name] }),
  }),
);

export type AgentRunStep = InferSelectModel<typeof agentRunStep>;
