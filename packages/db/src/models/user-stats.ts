import type { ObjectId } from "mongodb";

export type UserWordStat = {
  _id?: ObjectId;
  userId: string;
  canonicalWord: string;
  wrongCount: number;
  correctCount: number;
  lastReviewedAt: Date | null;
  masteryScore: number; // 0-100
};

export type UserCategoryStat = {
  _id?: ObjectId;
  userId: string;
  category: string;
  totalAttempts: number;
  totalCorrect: number;
  weaknessScore: number; // higher = weaker
};
