import { pgTable, uuid, text, integer, numeric, jsonb, timestamp, unique } from "drizzle-orm/pg-core";

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

export const stores = pgTable("stores", {
  id: uuid("id").defaultRandom().primaryKey(),
  domain: text("domain").notNull().unique(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const storeProducts = pgTable("store_products", {
  id: uuid("id").defaultRandom().primaryKey(),
  storeId: uuid("store_id").notNull().references(() => stores.id),
  url: text("url").notNull(),
  slug: text("slug").notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [unique().on(table.storeId, table.url)]);

export const productAnalyses = pgTable("product_analyses", {
  id: uuid("id").defaultRandom().primaryKey(),
  productUrl: text("product_url").notNull().unique(),
  storeDomain: text("store_domain").notNull(),
  score: integer("score").notNull(),
  summary: text("summary"),
  tips: jsonb("tips"),
  categories: jsonb("categories"),
  productPrice: numeric("product_price"),
  productCategory: text("product_category"),
  estimatedMonthlyVisitors: integer("estimated_monthly_visitors"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
