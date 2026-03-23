import { pgTable, uuid, text, integer, numeric, jsonb, timestamp } from "drizzle-orm/pg-core";

export const reports = pgTable("reports", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  url: text("url").notNull(),
  score: integer("score").notNull(),
  summary: text("summary"),
  tips: jsonb("tips"),
  categories: jsonb("categories"),
  productPrice: numeric("product_price"),
  productCategory: text("product_category"),
  estimatedVisitors: integer("estimated_visitors"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const subscribers = pgTable("subscribers", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  firstScanUrl: text("first_scan_url"),
  firstScanScore: integer("first_scan_score"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const scans = pgTable("scans", {
  id: uuid("id").defaultRandom().primaryKey(),
  url: text("url").notNull(),
  score: integer("score"),
  productCategory: text("product_category"),
  productPrice: numeric("product_price"),
  createdAt: timestamp("created_at").defaultNow(),
});
