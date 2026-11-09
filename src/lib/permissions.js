// Roles and permissions for Organization (company) accounts.
//
// A company has one CEO (the account owner) and staff with a role. Each role
// has default access to every area of the system, and the CEO can change the
// access of any person, area by area:
//   'none'  - the area is hidden
//   'view'  - can open and read it
//   'write' - can also add and change things
//
// IMPORTANT: for the data areas (products, sales, credits, quotations,
// expenses) the same defaults also live in the database function
// org_access() (SQL block 2). If you change a default here, change it there.
// Staff can never delete records: deletes go through CEO approval.

export const MODULES = [
  'dashboard',
  'products',
  'sales',
  'credits',
  'quotations',
  'analysis',
  'expenses',
  'financials',
  'approvals',
  'team',
  'settings',
]

export const MODULE_LABELS = {
  dashboard: 'Dashboard',
  products: 'Products',
  sales: 'Sales',
  credits: 'Credits',
  quotations: 'Quotations',
  analysis: 'Analysis',
  expenses: 'Expenses',
  financials: 'Financial breakdown',
  approvals: 'Approvals',
  team: 'Team',
  settings: 'Account settings',
}

// Areas that only exist for companies (a normal client never has them)
export const ORG_ONLY_MODULES = ['approvals', 'team']

export const ROLES = ['manager', 'sales', 'labor']

export const ROLE_LABELS = {
  ceo: 'CEO',
  manager: 'Manager',
  sales: 'Sales',
  labor: 'Stock keeper',
}

// The name to show for a team member or an invitation:
// the company's own role name if it has one, otherwise the standard name
export const getRoleName = (row) => row?.role_label || ROLE_LABELS[row?.role] || 'Team member'

export const ROLE_DEFAULTS = {
  manager: {
    dashboard: 'view',
    products: 'write',
    sales: 'write',
    credits: 'write',
    quotations: 'write',
    analysis: 'view',
    expenses: 'write',
    financials: 'none',
    approvals: 'none',
    team: 'none',
    settings: 'none',
  },
  sales: {
    dashboard: 'view',
    products: 'view',
    sales: 'write',
    credits: 'write',
    quotations: 'write',
    analysis: 'none',
    expenses: 'none',
    financials: 'none',
    approvals: 'none',
    team: 'none',
    settings: 'none',
  },
  labor: {
    dashboard: 'view',
    products: 'write',
    sales: 'none',
    credits: 'none',
    quotations: 'none',
    analysis: 'none',
    expenses: 'none',
    financials: 'none',
    approvals: 'none',
    team: 'none',
    settings: 'none',
  },
}

const LEVELS = ['none', 'view', 'write']

// role: 'ceo', 'manager', 'sales', 'labor', or null for a normal client / admin.
// permissions: the per-person overrides saved by the CEO, e.g. { "products": "view" }.
export const resolveAccess = (role, permissions, module) => {
  if (role === 'ceo') return 'write'
  // A normal client keeps full access to their own areas; company-only areas stay closed
  if (!role) return ORG_ONLY_MODULES.includes(module) ? 'none' : 'write'

  const custom = permissions && permissions[module]
  if (LEVELS.includes(custom)) return custom
  return (ROLE_DEFAULTS[role] && ROLE_DEFAULTS[role][module]) || 'none'
}

// The first page a person is allowed to open (used to redirect after login)
export const FIRST_PAGE_ORDER = [
  ['dashboard', '/dashboard'],
  ['sales', '/sales'],
  ['products', '/products'],
  ['credits', '/credits'],
  ['quotations', '/quotations'],
  ['analysis', '/analysis'],
  ['approvals', '/approvals'],
  ['team', '/team'],
]
