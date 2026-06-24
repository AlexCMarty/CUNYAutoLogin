---
title: "Why does CUNY log you out so much?"
layout: default
nav_order: 1
permalink: /why-does-cuny-log-you-out/
description: "Why CUNY logs you out so often — its CUNY Login single sign-on times out and every service keeps its own session — plus how to stop re-typing your password and 2FA code."
---

# Why does CUNY keep logging you out?
{: .no_toc }

**Last updated:** June 24, 2026

CUNY routes every site — CUNYfirst, Brightspace, DegreeWorks — through one central sign-on called **CUNY Login**. That central session is short-lived. So as you hop between them, or after the session sits idle for a while, it expires and CUNY makes you sign in again with your password *and* a fresh six-digit 2FA code.
{: .fs-5 }

It isn't your account, your browser, or anything you did wrong. It's how CUNY's login is built, and it's the same for every student.

## The real reasons you log in so much

| What's happening | Why it logs you out |
|:---|:---|
| **The central sign-on times out** | CUNY Login keeps one session in front of everything. When it expires — especially after you've been idle — every CUNY site sends you back to the sign-in page. |
| **2FA gets re-checked** | For security, CUNY re-asks for your six-digit authenticator code whenever a session is new or has expired — not just once a semester. |
| **Switching devices or browsers** | A session lives inside one browser profile. Move to your phone, a lab computer, or a different browser and you start over. |

## Is something wrong with my account?

No — this is working as designed. Short sessions and repeated multi-factor prompts are a deliberate security trade-off: if you ever walk away from a shared library or lab computer, they limit how long someone else could use your account. Annoying for you, safer for your records. Nothing is broken, and you don't need to call the Help Desk.

## How to get logged out a little less (no extension needed)

You can't switch off CUNY's timeouts, but a few habits cut down how often they hit:

1. **Use the same browser, every time.** Your session lives in that browser profile's cookies. Pick one — Chrome, Edge, or Firefox — and keep using it for CUNY.
2. **Avoid Incognito / Private windows for CUNY.** They discard cookies the moment you close them, so you start from zero next time.
3. **Don't clear cookies for `cuny.edu`.** If your browser or a "privacy cleaner" extension wipes cookies on exit, add an exception for `cuny.edu`.
4. **Keep one CUNY tab open** instead of closing everything — a live session goes idle and expires faster once every tab is gone.

Even with all of that, CUNY's central session still expires on its own, and you'll still get the 2FA prompt. These habits reduce the logins; they don't end them.

## The actual fix: stop typing the login altogether

If you want the logins to simply stop costing you time, the only real fix is to automate the part you keep redoing — typing your email, your password, and your authenticator code.

That's what **CUNYAutoLogin** does. It's a free, open-source browser extension that fills and submits the whole CUNY Login for you, including the six-digit 2FA code, which it generates on your device the same way an authenticator app does. It can't stop CUNY from ending your session — but it makes the logout invisible: the next CUNY page is already filled and submitted before you'd have finished reaching for your phone.

Your email, password, and authenticator secret are encrypted on your own computer — no account, no cloud, no analytics, and the extension can only touch CUNY's sign-in pages. [See exactly what happens to your credentials →](/security/)

<div class="cta-row" markdown="0">
  <a class="btn-cta btn-cta--primary js-install-cta" href="https://chromewebstore.google.com/detail/cunyautologin/nkkoameonkenaahfjkkicaphfncjikin">Add to Chrome</a>
  <a class="btn-cta btn-cta--secondary" href="/install/">All install options</a>
</div>

## Quick answers

### Why does CUNY / Brightspace keep logging me out?

Because CUNY Login runs one central, short-lived session in front of every CUNY site. When that session times out or you move between services, CUNY asks for your password and a new 2FA code again.

### Why do I have to enter my authenticator code every time?

CUNY re-checks your second factor whenever it starts a fresh session. CUNYAutoLogin generates that six-digit code for you on your device, so you never type it again.

### How long until CUNY logs me out?

CUNY doesn't publish the exact timeout, and it differs by service, but it's short enough that students hit it several times a day — and sooner when the session sits idle.

### Does CUNY log everyone out this much, or is it just me?

Everyone. It's how CUNY's single sign-on and multi-factor security are configured — not a problem with your account or your device.

{% include closing-cta.html %}

<!-- TechArticle + FAQPage structured data for search engines and AI answer engines.
     Keep the FAQ answer text in sync with the visible "Quick answers" Q&As above. -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Why does CUNY keep logging you out?",
  "description": "CUNY logs you out so often because its CUNY Login single sign-on session is short-lived and every service — Brightspace, CUNYfirst, DegreeWorks — shares the same session. Here is the real reason, plus how to stop re-typing your password and 2FA code.",
  "datePublished": "2026-06-24",
  "dateModified": "2026-06-24",
  "inLanguage": "en",
  "url": "https://cunyautologin.alexmarty.dev/why-does-cuny-log-you-out/",
  "mainEntityOfPage": "https://cunyautologin.alexmarty.dev/why-does-cuny-log-you-out/",
  "image": "https://cunyautologin.alexmarty.dev/assets/img/og-card.png",
  "author": {
    "@type": "Person",
    "name": "Alexander C. Marty"
  },
  "publisher": {
    "@type": "Person",
    "name": "Alexander C. Marty"
  },
  "about": "CUNY Login single sign-on session and multi-factor authentication"
}
</script>
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Why does CUNY / Brightspace keep logging me out?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Because CUNY Login runs one central, short-lived session in front of every CUNY site. When that session times out or you move between services, CUNY asks for your password and a new 2FA code again."
      }
    },
    {
      "@type": "Question",
      "name": "Why do I have to enter my authenticator code every time?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "CUNY re-checks your second factor whenever it starts a fresh session. CUNYAutoLogin generates that six-digit code for you on your device, so you never type it again."
      }
    },
    {
      "@type": "Question",
      "name": "How long until CUNY logs me out?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "CUNY doesn't publish the exact timeout, and it differs by service, but it's short enough that students hit it several times a day — and sooner when the session sits idle."
      }
    },
    {
      "@type": "Question",
      "name": "Does CUNY log everyone out this much, or is it just me?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Everyone. It's how CUNY's single sign-on and multi-factor security are configured — not a problem with your account or your device."
      }
    }
  ]
}
</script>
