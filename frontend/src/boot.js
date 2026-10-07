// Starts the site. This tiny file keeps the stable name /assets/app.js (index.html
// gets a fresh ?v= on it every deploy); the real app lives in files named after
// their content, so a browser can never mix pieces from two different deploys.
import("./main.jsx").catch((err) => {
  // Same rule as the boot guard in index.html: one cache-bypassing reload, then show the error.
  let retried = true;
  try { retried = sessionStorage.getItem("mv_boot_retry") === "1"; } catch (e) { /* storage blocked: don't loop */ }
  if (!retried) {
    try { sessionStorage.setItem("mv_boot_retry", "1"); } catch (e) {}
    const u = new URL(window.location.href);
    u.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(u.toString());
    return;
  }
  if (window.showBootError) window.showBootError("Couldn't load the page files — " + ((err && err.message) || err));
});
