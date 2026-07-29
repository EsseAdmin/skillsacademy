import { query } from './db';

// Read models for the public marketing pages. Both tables predate this feature
// and follow the database's existing conventions: TEXT primary keys generated
// by the application and ISO-8601 strings for timestamps.

export type SubscriptionPlan = {
  id: string;
  key: string;
  name: string;
  price_pence: number;
  trial_days: number;
  // TEXT holding a JSON array in this database, but a jsonb column elsewhere
  // would arrive already parsed — the caller handles both.
  features_json: string | string[] | null;
  sort_order: number;
};

// `is_active` / `is_deleted` are integer flags (0/1) in this schema, while a
// Postgres boolean column would compare against true/false. Casting to text
// matches either shape instead of erroring on a type mismatch.
export const Plans = {
  async all(activeOnly = false): Promise<SubscriptionPlan[]> {
    const { rows } = await query<SubscriptionPlan>(
      activeOnly
        ? `SELECT id, key, name, price_pence, trial_days, features_json, sort_order
           FROM subscription_plans
           WHERE is_active::text IN ('1', 'true', 't')
           ORDER BY sort_order`
        : `SELECT id, key, name, price_pence, trial_days, features_json, sort_order
           FROM subscription_plans
           ORDER BY sort_order`
    );
    return rows;
  },
};

export const Academies = {
  /** Number of academies that have not been soft-deleted. */
  async count(): Promise<number> {
    const { rows } = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM academies
       WHERE is_deleted::text IN ('0', 'false', 'f')`
    );
    return rows[0]?.count ?? 0;
  },
};
