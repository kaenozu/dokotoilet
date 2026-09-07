import type {
  CleanlinessGrade,
  ToiletFacility,
  ToiletReview,
} from "../src/types";
import type { ReviewInput, StoredReport } from "./community";

export interface ListReportsOptions {
  status?: "open" | "resolved" | "all";
  limit?: number;
  offset?: number;
}

export interface ResolveReportResult {
  found: boolean;
  report?: StoredReport;
}

export interface DeleteReviewResult {
  found: boolean;
  facilityId?: string;
  kind?: "community" | "external";
  reviewCount?: number;
}

export interface AddReviewResult {
  error?: "not_found" | "duplicate";
  toilet?: ToiletFacility;
  facilityId?: string;
  reviews?: ToiletReview[];
  reviewCount?: number;
  cleanlinessScore?: number;
  cleanlinessGrade?: CleanlinessGrade;
  overallScore?: number;
}

export interface ExternalFacilityObservation {
  id: string;
  source: "osm" | "google" | "od";
  origin: "static-seed" | "live-osm" | "migration" | "restore";
  legacyId?: string;
}

/**
 * Storage boundary for community data. Implementations must preserve the
 * current router-visible contract and make each mutation atomic from the
 * caller's perspective.
 */
export interface CommunityRepository {
  getToilets(): Promise<ToiletFacility[]>;
  getExternalReviews(): Promise<Record<string, ToiletReview[]>>;
  addToilet(toilet: ToiletFacility): Promise<{ added: boolean }>;
  addReview(
    facilityId: string,
    input: ReviewInput,
    ipHash: string
  ): Promise<AddReviewResult>;
  voteHelpful(
    reviewId: string,
    ipHash: string
  ): Promise<{ helpfulCount: number; voted: boolean; found: boolean }>;
  addReport(
    facilityId: string,
    reviewId: string,
    reason: string
  ): Promise<{ ok: boolean; found: boolean; duplicate?: boolean }>;
  listReports?(opts?: ListReportsOptions): Promise<StoredReport[]>;
  resolveReport?(reportId: string, note?: string): Promise<ResolveReportResult>;
  deleteReview?(reviewId: string, reason?: string): Promise<DeleteReviewResult>;
  registerExternalFacilities?(facilities: ExternalFacilityObservation[]): Promise<void>;
  isKnownExternalFacility?(facilityId: string): Promise<boolean>;
  /**
   * Known external facility IDs (OSM/Google/OD). Implemented by both backends.
   * Used by ops tooling to restore reviewability of facilities whose review list
   * is empty (e.g. after curation removed a reported review).
   */
  listKnownExternalFacilityIds(): Promise<string[]>;
}
