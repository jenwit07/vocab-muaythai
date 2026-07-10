import type { ObjectId } from "mongodb";

export type VocabWord = {
  _id?: ObjectId;
  word: string;
  canonicalWord: string; // lowercase trimmed — unique index
  pos: string; // noun, verb, adjective, etc.
  meaningTh: string;
  meaningEn?: string;
  category: string;
  subCategory?: string;
  confusedWith: string[];
  collocations: string[];
  examples: string[];
  difficulty: "easy" | "medium" | "hard";
  embedding?: number[]; // vector for semantic search
  createdAt: Date;
};

export const CATEGORIES = [
  "business_finance",
  "office_workplace",
  "jobs_hiring",
  "travel",
  "customer_service",
  "sales_marketing",
  "shipping_delivery",
  "restaurant_hotel",
  "office_equipment",
  "common_business_verbs",
] as const;

export type Category = (typeof CATEGORIES)[number];
