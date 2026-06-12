  import { boot, api } from "/js/app.js";
  boot("/advertise");

  const $ = (id) => document.getElementById(id);
  let bannerId = null;

  // gate on login
  api("/api/auth?action=me").catch(() => {
    $("gate").hidden = false;
    $("formCard").hidden = true;
  });

  // end-time preview from start + duration
  function preview() {
    const s = $("startsAt").value;
    if (!s) return;
    const end = new Date(new Date(s).getTime() + Number($("durationMin").value) * 60000);
    $("endPreview").textContent = `Ends ${end.toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" })} - the listing leaves the feed at that moment.`;
  }
  $("startsAt").addEventListener("input", preview);
  $("durationMin").addEventListener("change", preview);

  // ---------- banner dropzone ----------
  const dz = $("dz"), input = $("dzInput");
  dz.addEventListener("click", () => input.click());
  dz.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") input.click(); });
  ["dragover", "dragenter"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.remove("drag"); }));
  dz.addEventListener("drop", (e) => handle(e.dataTransfer.files[0]));
  input.addEventListener("change", () => handle(input.files[0]));

  // Error text may echo user/server input, so it is escaped. Success HTML is ours.
  function say(text, ok = false) {
    const safe = ok ? text : text.replace(/[<>&]/g, "");
    $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${safe}</div>`;
    $("msg").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function handle(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return say("Banner must be under 2MB.");
    // client-side dimension check for instant feedback (server re-validates)
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
      dz.innerHTML = `<span>Banner attached ✓ - click to replace</span><img src="${d.url}" alt="Banner preview">`;
      dz.appendChild(input);
    } catch (e) {
      $("dzText").textContent = "Drag a 1200x480 banner here, or click to choose a file";
      say(e.message);
    }
  }

  // ---------- publish ----------
  $("publish").addEventListener("click", async () => {
    $("publish").disabled = true;
    try {
      const startsAt = $("startsAt").value;
      const d = await api("/api/events?action=create", {
        method: "POST",
        body: {
          title: $("title").value,
          scenario: $("scenario").value,
          description: $("description").value,
          startsAt: startsAt ? new Date(startsAt).toISOString() : "",
          durationMin: Number($("durationMin").value),
          joinCode: $("joinCode").value,
          bannerId,
          reportRecipientId: $("reportRecipientId").value,
          website: $("website").value, // honeypot
        },
      });
      say(`Published. Your listing is live in the <a href="/events">discovery feed</a>, and your report will be ready in the <a href="/dashboard">dashboard</a> when it ends.`, true);
    } catch (e) {
      say(e.message);
    } finally {
      $("publish").disabled = false;
    }
  });
