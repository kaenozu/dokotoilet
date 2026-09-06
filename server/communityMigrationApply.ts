import type { FirestoreLike } from "./firestoreCommunityStore";
import type { FirestoreMigrationPlan } from "./communityMigrationPlan";

export interface MigrationApplyResult {
  applied: boolean;
  documentCount: number;
  countsByCollection: Record<string, number>;
}

/**
 * Applies a deterministic migration plan with idempotent document IDs.
 *
 * This intentionally uses document set rather than create: if a process fails
 * halfway through, rerunning the exact same plan converges to the same state.
 * Production callers must freeze community writes before using this function.
 */
export async function applyFirestoreMigrationPlan(
  db: FirestoreLike,
  plan: FirestoreMigrationPlan,
  options: { apply?: boolean } = {}
): Promise<MigrationApplyResult> {
  if (!options.apply) {
    return {
      applied: false,
      documentCount: plan.documents.length,
      countsByCollection: { ...plan.countsByCollection },
    };
  }

  for (const document of plan.documents) {
    await db.collection(document.collection).doc(document.id).set(document.data);
  }

  return {
    applied: true,
    documentCount: plan.documents.length,
    countsByCollection: { ...plan.countsByCollection },
  };
}
