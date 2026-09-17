/**
 * Drop this in once, at the top of your app (before any of the shop
 * tools load), pointed at your deployed backend's URL. Every existing
 * file — the calculator, admin console, POS, repairs, till, CRM,
 * dashboard — already calls window.storage.get/set/delete/list and
 * needs ZERO code changes.
 *
 * This version requires a REAL login (username + password verified by
 * the server) instead of the earlier random-per-browser clientId. The
 * "staff_on_shift" text field in POS/repairs that used to let anyone
 * type any name still works as a display label, but the actual data
 * isolation (private storage, and the updated_by audit trail on shared
 * writes) is now tied to a verified account, not free text.
 *
 * Usage:
 *   <script src="storage-shim.js"></script>
 *   <script>
 *     window.shopAuth.mountLoginGate(document.getElementById("app"), {
 *       baseUrl: "https://your-backend.example.com",
 *       onReady: () => { // render your app here, window.storage is ready }
 *     });
 *   </script>
 */
(function () {
  const TOKEN_KEY = "shop_auth_token";

  function saveSession(session) { localStorage.setItem(TOKEN_KEY, JSON.stringify(session)); }
  function loadSession() {
    try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || "null"); } catch { return null; }
  }
  function clearSession() { localStorage.removeItem(TOKEN_KEY); }

  function installStorage(baseUrl, getToken) {
    // getToken may return null/undefined for an anonymous visitor — that's
    // expected now, not an error. The backend's public routes (catalog
    // reads, order/lead submissions, price-match/bulk-quote requests)
    // work with no Authorization header at all; only staff-only calls
    // need a real token, and those correctly get rejected server-side
    // if one isn't present.
    async function authedFetch(url, opts = {}) {
      const token = getToken();
      const headers = { ...(opts.headers || {}) };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(url, { ...opts, headers });
      if (res.status === 401 && token) { clearSession(); throw new Error("session expired — please log in again"); }
      return res;
    }
    window.storage = {
      async get(key, shared) {
        const params = new URLSearchParams({ shared: String(!!shared) });
        const res = await authedFetch(`${baseUrl}/storage/${encodeURIComponent(key)}?${params}`);
        if (res.status === 404) throw new Error(`key not found: ${key}`);
        if (!res.ok) throw new Error(`storage.get failed: ${res.status}`);
        return res.json();
      },
      async set(key, value, shared) {
        const res = await authedFetch(`${baseUrl}/storage/${encodeURIComponent(key)}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value, shared: !!shared }),
        });
        if (!res.ok) throw new Error(`storage.set failed: ${res.status}`);
        return res.json();
      },
      async delete(key, shared) {
        const params = new URLSearchParams({ shared: String(!!shared) });
        const res = await authedFetch(`${baseUrl}/storage/${encodeURIComponent(key)}?${params}`, { method: "DELETE" });
        if (!res.ok) throw new Error(`storage.delete failed: ${res.status}`);
        return res.json();
      },
      async list(prefix, shared) {
        const params = new URLSearchParams({ prefix: prefix || "", shared: String(!!shared) });
        const res = await authedFetch(`${baseUrl}/storage?${params}`);
        if (!res.ok) throw new Error(`storage.list failed: ${res.status}`);
        return res.json();
      },
    };
  }

  async function login(baseUrl, username, password) {
    const res = await fetch(`${baseUrl}/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "login failed");
    saveSession(body);
    return body;
  }

  async function register(baseUrl, username, password, role, existingToken) {
    const headers = { "Content-Type": "application/json" };
    if (existingToken) headers.Authorization = `Bearer ${existingToken}`;
    const res = await fetch(`${baseUrl}/auth/register`, { method: "POST", headers, body: JSON.stringify({ username, password, role }) });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || "registration failed");
    return body;
  }

  function logout(baseUrl) {
    const session = loadSession();
    clearSession();
    if (session?.token) {
      // Best-effort — revoke server-side even if this fetch never resolves
      // (e.g. offline), since the local session is already cleared either way.
      fetch(`${baseUrl}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${session.token}` } }).catch(() => {});
    }
    // Storage stays installed (using whatever token now exists, i.e. none)
    // rather than being torn down — a customer browsing the public site
    // still needs window.storage to work after a staff member logs out
    // of the same browser tab.
    installStorage(baseUrl, () => { const s = loadSession(); return s?.token || null; });
  }

  // Call this once, unconditionally, at your app's startup — for every
  // visitor, logged in or not. This is what makes window.storage work
  // for an anonymous customer on the public pages, not just for staff
  // after they log in. Login (mountLoginGate, or your own login form)
  // is a separate, additional step for whichever routes need it.
  function installStorageForEveryone(baseUrl) {
    installStorage(baseUrl, () => { const s = loadSession(); return s?.token || null; });
  }
  function currentUser() { const s = loadSession(); return s ? { username: s.username, role: s.role } : null; }

  // A minimal, dependency-free login screen so this is usable without
  // also having to build a login UI yourself first. Replace with your
  // own form if you want it to match your site's design — the only
  // required piece is calling login()/register() and installStorage().
  function mountLoginGate(container, { baseUrl, onReady }) {
    const session = loadSession();
    if (session && session.token) {
      installStorage(baseUrl, () => loadSession().token);
      onReady();
      return;
    }

    container.innerHTML = `
      <div style="max-width:320px;margin:60px auto;font-family:system-ui,sans-serif;">
        <h2 style="margin-bottom:16px;">Sign in</h2>
        <input id="shop-login-user" placeholder="Username" style="width:100%;padding:10px;margin-bottom:8px;box-sizing:border-box;" />
        <input id="shop-login-pass" placeholder="Password" type="password" style="width:100%;padding:10px;margin-bottom:8px;box-sizing:border-box;" />
        <button id="shop-login-btn" style="width:100%;padding:10px;margin-bottom:8px;">Sign in</button>
        <div id="shop-login-error" style="color:#c1554a;font-size:13px;min-height:18px;"></div>
        <div style="font-size:12px;color:#888;margin-top:12px;">
          First time setting this shop up? Registering an account here becomes
          the admin automatically if no accounts exist yet.
        </div>
        <button id="shop-register-btn" style="width:100%;padding:8px;margin-top:8px;background:none;border:1px solid #ccc;">
          Register new account
        </button>
      </div>
    `;
    const userEl = container.querySelector("#shop-login-user");
    const passEl = container.querySelector("#shop-login-pass");
    const errEl = container.querySelector("#shop-login-error");

    container.querySelector("#shop-login-btn").onclick = async () => {
      errEl.textContent = "";
      try {
        await login(baseUrl, userEl.value, passEl.value);
        installStorage(baseUrl, () => loadSession().token);
        onReady();
      } catch (e) { errEl.textContent = e.message; }
    };
    container.querySelector("#shop-register-btn").onclick = async () => {
      errEl.textContent = "";
      try {
        await register(baseUrl, userEl.value, passEl.value);
        await login(baseUrl, userEl.value, passEl.value);
        installStorage(baseUrl, () => loadSession().token);
        onReady();
      } catch (e) { errEl.textContent = e.message; }
    };
  }

  window.shopAuth = { login, register, logout, currentUser, mountLoginGate, installStorage, installStorageForEveryone };
})();
