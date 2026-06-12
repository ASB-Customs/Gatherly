  import { boot, esc } from "/js/app.js";
  boot("/login");
  const e = new URLSearchParams(location.search).get("error");
  if (e) document.getElementById("err").innerHTML = `<div class="alert alert-err" style="text-align:left">${esc(e)}</div>`;
