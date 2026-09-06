import type { ToiletFacility, ToiletReview } from "../src/types";

export type ReviewInput = Omit<ToiletReview, "id" | "helpfulCount" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export interface AddReviewResult {
  added: boolean;
  duplicate?: boolean;
  notFound?: boolean;
  facilityId: string;
  review?: ToiletReview;
  reviews: ToiletReview[];
  toilet?: ToiletFacility;
}

export interface HelpfulVoteResult {
  found: boolean;
  voted: boolean;
  helpfulCount: number;
}

export interface ReportResult {
  added: boolean;
  found: boolean;
  reportId?: string;
}

export interface ExternalFacilityObservation {
  id: string;
  source: "osm" | "google" | "od";
  origin: "static-seed" | "live-osm" | "migration";
  legacyId?: string;
}

/** Storage boundary for durable community data. */
export interface CommunityRepository {
  getToilets(): Promise<ToiletFacility[]>;
  getExternalReviews(): Promise<Record<string, ToiletReview[]>>;
  addToilet(toilet: ToiletFacility): Promise<{ added: boolean; toilet?: ToiletFacility }>;
  addReview(facilityId: string, input: ReviewInput, ipHash: string): Promise<AddReviewResult>;
  voteHelpful(reviewId: string, ipHash: string): Promise<HelpfulVoteResult>;
  addReport(facilityId: string, reviewId: string, reason: string): Promise<ReportResult>;
  registerExternalFacilities?(facilities: ExternalFacilityObservation[]): Promise<void>;
  isKnownExternalFacility?(facilityId: string): Promise<boolean>;
}
