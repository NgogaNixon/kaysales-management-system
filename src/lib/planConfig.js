// Single source of truth for KaySales plans.
//
// Every page that needs a plan name, price, limit or feature should read it
// from here instead of comparing plan_type strings by hand. To change what a
// plan includes (or its price), edit this file only.
//
// Plans differ by FUNCTION, not by time period. All three plans are billed
// monthly and every client has an expiry date.

export const PLAN_IDS = {
  STANDARD: 'standard',
  PREMIUM: 'premium',
  ORGANIZATION: 'organization',
}

// Order used when showing plans side by side and when deciding which plan is
// the "cheapest one that has this feature".
export const PLAN_ORDER = [
  PLAN_IDS.STANDARD,
  PLAN_IDS.PREMIUM,
  PLAN_IDS.ORGANIZATION,
]

// A limit of null means "unlimited".
export const PLANS = {
  standard: {
    id: 'standard',
    name: 'Standard',
    price: 20000,
    billing: 'monthly',
    popular: false,
    requiresAdminSetup: false,
    limits: {
      maxCategories: 3,
      maxSeats: 1,
    },
    features: {
      dashboard: true,
      products: true,
      sales: true,
      credits: true,
      expenses: true,
      quotations: false,
      advancedAnalytics: false,
      fullFinancialBreakdown: false,
      teamAccounts: false,
      approvals: false,
    },
    highlights: [
      'Up to 3 stock categories',
      'Sales tracking',
      'Product management',
      'Credits tracking',
      'Basic dashboard',
      'Email support',
    ],
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    price: 35000,
    billing: 'monthly',
    popular: true,
    requiresAdminSetup: false,
    limits: {
      maxCategories: null,
      maxSeats: 1,
    },
    features: {
      dashboard: true,
      products: true,
      sales: true,
      credits: true,
      expenses: true,
      quotations: true,
      advancedAnalytics: true,
      fullFinancialBreakdown: true,
      teamAccounts: false,
      approvals: false,
    },
    highlights: [
      'Unlimited stock categories',
      'Quotations that convert to sales',
      'Full financial breakdown',
      'Advanced analytics',
      'Revenue charts and reports',
      'Priority support',
    ],
  },

  organization: {
    id: 'organization',
    name: 'Organization',
    price: 80000,
    billing: 'monthly',
    popular: false,
    // An admin creates and switches on the company account; clients cannot
    // self-activate this plan.
    requiresAdminSetup: true,
    limits: {
      maxCategories: null,
      maxSeats: 10, // default; admin can change per company (subscriptions.seat_limit)
    },
    features: {
      dashboard: true,
      products: true,
      sales: true,
      credits: true,
      expenses: true,
      quotations: true,
      advancedAnalytics: true,
      fullFinancialBreakdown: true,
      teamAccounts: true,
      approvals: true,
    },
    highlights: [
      'Everything in Premium',
      'Company account with a CEO, managers and staff',
      'Choose what each person can see and do',
      'CEO approves sensitive actions',
      'Full financial breakdown for the CEO',
      'Activity trail for every team member',
    ],
  },
}

// Unknown, empty or missing plan values fall back to Standard (same as the
// rest of the app has always done).
export const normalizePlanId = (planType) => {
  if (planType && PLANS[planType]) return planType
  return PLAN_IDS.STANDARD
}

export const getPlan = (planType) => PLANS[normalizePlanId(planType)]

// The plan whose features and limits actually apply.
export const getEffectivePlan = (planType) => getPlan(planType)

export const getPlanLabel = (planType) => getPlan(planType).name

export const isOrganizationPlan = (planType) =>
  normalizePlanId(planType) === PLAN_IDS.ORGANIZATION

// overrides is the optional per-client object stored on
// subscriptions.feature_overrides, e.g. { "quotations": true, "maxCategories": 6 }.
// An override always wins over the plan default.
const hasOverride = (overrides, key) =>
  overrides && typeof overrides === 'object' && Object.prototype.hasOwnProperty.call(overrides, key)

export const hasFeature = (planType, feature, overrides) => {
  if (hasOverride(overrides, feature)) return Boolean(overrides[feature])
  return Boolean(getEffectivePlan(planType).features[feature])
}

// Returns a number, or null when the limit is unlimited.
export const getLimit = (planType, limitKey, overrides) => {
  if (hasOverride(overrides, limitKey)) {
    const value = overrides[limitKey]
    return value === null || value === undefined || value === '' ? null : Number(value)
  }
  const value = getEffectivePlan(planType).limits[limitKey]
  return value === undefined ? null : value
}

// True when one more item can still be added under the limit.
export const canAddMore = (limit, currentCount) =>
  limit === null || limit === undefined || currentCount < limit

// Name of the cheapest sold plan that includes a feature. Used for messages
// like "Upgrade to Premium to use quotations".
export const getMinimumPlanFor = (feature) => {
  const id = PLAN_ORDER.find((planId) => PLANS[planId].features[feature])
  return id ? PLANS[id] : null
}

// Plans shown on the landing page and the choose-plan screen, in order.
export const getSoldPlans = () => PLAN_ORDER.map((id) => PLANS[id])

export const formatRwf = (amount) => `RWF ${Number(amount || 0).toLocaleString()}`

export const formatPlanPrice = (planType) => `${formatRwf(getPlan(planType).price)} per month`
