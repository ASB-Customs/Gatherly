import { boot, api, esc, currentUser } from "/js/app.js";
boot("/advertise");

const $ = (id) => document.getElementById(id);
let bannerId = null;

let me = null;
api("/api/auth?action=me").then((d) => {
  me = d.user;
  if (!me) { $("gate").hidden = false; $("formCard").hidden = true; return; }
  const credits = me.credits ?? 0;
  $("boostRow").innerHTML = `
    <label class="field" style="display:flex;align-items:flex-start;gap:10px;font-weight:500;background:rgba(255,80,80,0.05);border:1px solid rgba(255,80,80,0.2);border-radius:10px;padding:12px 14px">
      <input type="checkbox" id="boost" style="width:auto;margin:3px 0 0" ${credits < 1 ? "disabled" : ""}>
      <span>
        <span style="color:#ff8080;font-weight:700">Boost this event &middot; 1 credit</span>
        <small style="display:block;color:var(--muted);margin-top:3px">Pins it to the top of discovery with a red highlight for the full duration. When it ends it archives below active events and the highlight is removed. You have <b style="color:var(--text)">${credits}</b> credit${credits === 1 ? "" : "s"}.${credits < 1 ? ` <a href="/pricing">Get credits</a>` : ""}</small>
      </span>
    </label>`;
}).catch(() => { $("gate").hidden = false; $("formCard").hidden = true; });

function preview() {
  const s = $("startsAt").value;
  if (!s) return;
  const end = new Date(new Date(s).getTime() + Number($("durationMin").value) * 60000);
  $("endPreview").textContent = `Ends ${end.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} - the listing leaves the feed at that moment.`;
}
$("startsAt").addEventListener("input", preview);
$("durationMin").addEventListener("change", preview);

const dz = $("dz"), input = $("dzInput");
dz.addEventListener("click", () => input.click());
dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
["dragover", "dragenter"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
dz.addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
input.addEventListener("change", () => handle(input.files[0]));

function say(text, ok = false) {
  $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${ok ? text : esc(text)}</div>`;
  $("msg").scrollIntoView({ behavior: "smooth", block: "center" });
}

async function handle(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) return say("Banner must be under 2MB.");
  const okDims = await new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img.naturalWidth === 1200 && img.naturalHeight === 480);
    img.onerror = () => res(false);
    img.src = URL.createObjectURL(file);
  });
  if (!okDims) return say("Banner must be exactly 1200x480px. Resize it and try again.");
  $("dzText").textContent = "Uploading…";
  try {
    const r = await fetch("/api/image", { method: "POST", body: file, credentials: "same-origin" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || "Upload failed.");
    bannerId = d.id;
    dz.innerHTML = `<span>Banner attached - click to replace</span><img src="${d.url}" alt="Banner preview">`;
    dz.appendChild(input);
  } catch (e) {
    $("dzText").textContent = "Drag a 1200x480 banner here, or click to choose a file";
    say(e.message);
  }
}

$("publish").addEventListener("click", async () => {
  $("publish").disabled = true;
  try {
    const startsAt = $("startsAt").value;
    const wantsBoost = $("boost") ? $("boost").checked : false;
    const d = await api("/api/events?action=create", {
      method: "POST",
      body: {
        title: $("title").value, scenario: $("scenario").value, description: $("description").value,
        startsAt: startsAt ? new Date(startsAt).toISOString() : "",
        durationMin: Number($("durationMin").value),
        joinCode: $("joinCode").value, bannerId,
        reportRecipientId: $("reportRecipientId").value,
        boost: wantsBoost, website: $("website").value,
      },
    });
    say(`Published${d.boosted ? " and boosted" : ""}. Your listing is live in the <a href="/events">discovery feed</a>${d.boosted ? " with a featured red highlight" : ""}, and your report will be ready in the <a href="/dashboard">dashboard</a> when it ends.`, true);
  } catch (e) {
    say(e.message);
  } finally {
    $("publish").disabled = false;
  }
});
