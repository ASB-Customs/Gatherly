  import { boot, api, esc } from "/js/app.js";
  boot("/pricing");

  const $ = (id) => document.getElementById(id);
  const say = (t, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${esc(t)}</div>`; window.scrollTo({ top: 0, behavior: "smooth" }); };
  let robuxPlan = null;

  document.addEventListener("click", async (ev) => {
    const stripe = ev.target.closest("[data-stripe]");
    const robux = ev.target.closest("[data-robux]");
    if (stripe) {
      stripe.disabled = true;
      try {
        const d = await api("/api/billing?action=checkout", { method: "POST", body: { plan: stripe.dataset.stripe } });
        location.href = d.url;
      } catch (e) {
        say(e.message.includes("Log in") ? "Log in with Discord first, then subscribe." : e.message);
        stripe.disabled = false;
      }
    }
    if (robux) {
      robuxPlan = robux.dataset.robux;
      $("robuxCard").hidden = false;
      $("robuxCard").scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });

  $("verifyRobux").onclick = async () => {
    try {
      await api("/api/billing?action=verify-robux", { method: "POST", body: { plan: robuxPlan, robloxId: $("robloxId").value.trim() } });
      say("Verified. Your plan is active - head to the dashboard.", true);
    } catch (e) { say(e.message); }
  };
