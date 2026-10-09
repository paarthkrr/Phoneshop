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

// Access areas (server: backend/server.js, AREAS). Each role has defaults and
// the Owner can add or remove areas per person on the Team page.
export const AREA_LABELS = {
  register: "Register, trade-ins, stock & till",
  pricing: "Pricing console",
  reports: "Customers, reports & expenses",
  bank: "See customers' full bank details",
};
export const ROLE_AREAS = { admin: Object.keys(AREA_LABELS), manager: ["register", "pricing", "reports", "bank"], staff: ["register"], technician: ["pricing"] };

// What each screen needs: "all" = any staff member, "owner" = Owner only.
const SCREENS = {
  "/portal": "all",
  "/portal/inspect": "all",              // without "register": view only
  "/portal/pos": "register",
  "/portal/repairs": "all",
  "/portal/till": "register",
  "/portal/crm": "reports",
  "/portal/pricing": "pricing",
  "/portal/products": "register",
  "/portal/team": "all",                 // everyone can change their own password; only the Owner manages people
  "/portal/unlock": "register",    // counter staff + manager + admin can create unlock jobs
  "/portal/activity": "owner",
};
const ALIASES = { "/staff": "/portal", "/staff/admin": "/portal/pricing", "/staff/inspect": "/portal/inspect", "/staff/pos": "/portal/pos", "/staff/repairs": "/portal/repairs", "/staff/till": "/portal/till", "/staff/crm": "/portal/crm", "/staff/team": "/portal/team", "/staff/products": "/portal/products" };

function me() { try { return window.shopAuth && window.shopAuth.currentUser(); } catch (e) { return null; } }
export function currentRole() { const u = me(); return u ? u.role : null; }
export function currentAreas() {
  const u = me();
  if (!u) return [];
  return Array.isArray(u.areas) ? u.areas : ROLE_AREAS[u.role] || [];
}
export const hasArea = (area) => currentAreas().includes(area);
export function canSeeScreen(path, role, areas = currentAreas()) {
  const need = SCREENS[ALIASES[path] || path];
  if (!need || !role || need === "all") return true;
  if (need === "owner") return role === "admin";
  return areas.includes(need);
}
