import type { ToiletFacility } from "../types";

export function setHelpfulCount(
  toilet: ToiletFacility,
  toiletId: string,
  reviewId: string,
  helpfulCount: number
): ToiletFacility {
  if (toilet.id !== toiletId) return toilet;
  return {
    ...toilet,
    reviews: toilet.reviews.map((review) =>
      review.id === reviewId ? { ...review, helpfulCount } : review
    ),
  };
}

export function adjustHelpfulCount(
  toilet: ToiletFacility,
  toiletId: string,
  reviewId: string,
  delta: number
): ToiletFacility {
  if (toilet.id !== toiletId) return toilet;
  return {
    ...toilet,
    reviews: toilet.reviews.map((review) =>
      review.id === reviewId
        ? { ...review, helpfulCount: Math.max(0, review.helpfulCount + delta) }
        : review
    ),
  };
}
