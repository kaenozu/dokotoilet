import type {
  CleanlinessGrade,
  ToiletFacility,
  ToiletReview,
} from "../src/types";
import type { ReviewInput } from "./community";

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
  origin: "static-seed" | "live-osm" | "migration";
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
  ): Promise<{ ok: boolean; found: boolean }>;
  registerExternalFacilities?(facilities: ExternalFacilityObservation[]): Promise<void>;
  isKnownExternalFacility?(facilityId: string): Promise<boolean>;
}
