import type { SubscriptionPlan } from '@/lib/queries';

// The pricing section reads live plans from the database. If that read fails —
// no database bound to the deploy, or the table not yet migrated — the landing
// page still has to render, so it falls back to these three plans, which are
// the same ones the platform seeds. Keep them in step with the seeded plans so
// a visitor never sees pricing that contradicts checkout.
export const FALLBACK_PLANS: SubscriptionPlan[] = [
  {
    id: 'fallback-starter',
    key: 'starter',
    name: 'Starter',
    price_pence: 4900,
    trial_days: 14,
    features_json: [
      'Up to 50 learners',
      'Up to 3 instructors',
      'Up to 10 courses',
      '1 design template of your choice',
      'Course & module content library',
      'Email support',
    ],
    sort_order: 1,
  },
  {
    id: 'fallback-growth',
    key: 'growth',
    name: 'Growth',
    price_pence: 14900,
    trial_days: 14,
    features_json: [
      'Up to 500 learners',
      'Up to 15 instructors',
      'Up to 50 courses',
      'All design templates',
      'Paid course & module checkout',
      'Compliance & progress reporting',
      'Priority support',
    ],
    sort_order: 2,
  },
  {
    id: 'fallback-enterprise',
    key: 'enterprise',
    name: 'Enterprise',
    price_pence: 34900,
    trial_days: 14,
    features_json: [
      'Unlimited learners & instructors',
      'Unlimited courses',
      'All design templates + custom branding',
      'Advanced compliance & audit trail',
      'Dedicated success manager',
      'SLA-backed support',
    ],
    sort_order: 3,
  },
];
