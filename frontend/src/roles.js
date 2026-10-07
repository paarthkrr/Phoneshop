// Staff roles as shown in the portal. The server enforces what each role can
// open and change (backend/server.js, ACCESS); this list only decides which
// screens a role sees, so nobody lands on a page that would just show errors.
export const ROLE_LABELS = { admin: "Owner", manager: "Manager", staff: "Counter", technician: "Technician" };
export const ROLE_HELP = {
  admin: "Everything, including the team",
  manager: "Everything except the team",
  staff: "Register, trade-ins, repairs, till, products",
  technician: "Repairs and the pricing console",
};
export const ROLE_ORDER = ["staff", "technician", "manager", "admin"];

const ALL = ["admin", "manager", "staff", "technician"];
const SCREENS = {
  "/portal": ALL,
  "/portal/inspect": ALL,                 // Technician: view only
  "/portal/pos": ["admin", "manager", "staff"],
  "/portal/repairs": ALL,
  "/portal/till": ["admin", "manager", "staff"],
  "/portal/crm": ["admin", "manager"],
  "/portal/pricing": ["admin", "manager", "technician"],
  "/portal/products": ["admin", "manager", "staff"],
  "/portal/team": ALL,                    // everyone can change their own password; only the Owner manages people
  "/portal/activity": ["admin"],
};
const ALIASES = { "/staff": "/portal", "/staff/admin": "/portal/pricing", "/staff/inspect": "/portal/inspect", "/staff/pos": "/portal/pos", "/staff/repairs": "/portal/repairs", "/staff/till": "/portal/till", "/staff/crm": "/portal/crm", "/staff/team": "/portal/team", "/staff/products": "/portal/products" };

export function currentRole() {
  try { const u = window.shopAuth && window.shopAuth.currentUser(); return u ? u.role : null; } catch (e) { return null; }
}
export function canSeeScreen(path, role) {
  const p = ALIASES[path] || path;
  const allowed = SCREENS[p];
  return !allowed || !role || allowed.includes(role);
}
