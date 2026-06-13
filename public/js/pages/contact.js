<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Support - Gatherly</title>
  <link rel="icon" href="/assets/favicon.png">
  <link rel="preconnect" href="https://api.fontshare.com">
  <link href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600&f[]=general-sans@400,500,600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <link rel="stylesheet" href="/css/admin-additions.css">
</head>
<body>
<nav id="nav"></nav>

<header class="section" style="padding-bottom:28px">
  <div class="wrap">
    <span class="kicker">Support</span>
    <h1 style="font-size:clamp(2rem,4vw,3rem)">Talk to a person</h1>
    <p style="margin-top:10px;max-width:520px">Logged in, your message opens a live chat with our team. Billing questions, broken reports, takedown requests, or Network plan enquiries.</p>
  </div>
</header>

<section class="wrap" style="padding-bottom:80px;max-width:640px">
  <div class="card">
    <div id="msg"></div>
    <label class="field">Your Discord username <small>So we can reply if you're not logged in.</small>
      <input id="from" maxlength="60" autocomplete="off">
    </label>
    <label class="field">Topic
      <select id="topic">
        <option>Billing</option><option>Reports not generating</option><option>Listing or content issue</option>
        <option>Account or data request</option><option>Network plan</option><option>Something else</option>
      </select>
    </label>
    <label class="field">Message
      <textarea id="body" rows="5" maxlength="1500"></textarea>
    </label>
    <input class="hp" id="website" tabindex="-1" autocomplete="off" aria-hidden="true">
    <button class="btn btn-primary" id="send">Start chat</button>
  </div>
</section>

<footer id="footer"></footer>

<script type="module" src="/js/pages/contact.js"></script>
</body>
</html>
