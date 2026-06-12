  import { boot, api, esc } from "/js/app.js";
  boot("/contact");
  const $ = (id) => document.getElementById(id);
  $("send").onclick = async () => {
    $("send").disabled = true;
    try {
      await api("/api/contact", { method: "POST", body: {
        from: $("from").value, topic: $("topic").value, body: $("body").value, website: $("website").value,
      } });
      $("msg").innerHTML = `<div class="alert alert-ok">Sent. We will get back to you on Discord.</div>`;
      $("body").value = "";
    } catch (e) {
      $("msg").innerHTML = `<div class="alert alert-err">${esc(e.message)}</div>`;
    } finally { $("send").disabled = false; }
  };
