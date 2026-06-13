import { boot, api, esc, currentUser } from "/js/app.js";
boot("/contact");

const $ = (id) => document.getElementById(id);
const say = (text, ok = false) => { $("msg").innerHTML = `<div class="alert ${ok ? "alert-ok" : "alert-err"}">${ok ? text : esc(text)}</div>`; };

api("/api/auth?action=me").then((d) => {
  if (d.user && $("from")) { $("from").value = d.user.username; $("from").placeholder = d.user.username; }
}).catch(() => {});

$("send").addEventListener("click", async () => {
  if ($("website").value) return;
  const topic = $("topic").value;
  const subject = ($("subject")?.value || topic).trim();
  const message = $("body").value.trim();
  if (!message) return say("Type your message first.");
  $("send").disabled = true;
  try {
    const d = await api("/api/tickets?action=create", { method: "POST", body: { topic, subject, message, website: $("website").value } });
    say(`Sent. Our team will reply in your Discord DMs from the Gatherly bot${d.delivered ? "" : " (make sure you share a server with the bot and allow DMs)"}. You can also track it from your account.`, true);
    $("body").value = "";
  } catch (e) {
    if (/log in/i.test(e.message)) say(`You need to log in first so we can reply to you. <a href="/api/auth?action=start">Continue with Discord</a>`, false);
    else say(e.message);
  } finally { $("send").disabled = false; }
});
