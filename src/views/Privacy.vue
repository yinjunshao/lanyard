<script setup>
// Privacy Policy (UK GDPR). Bracketed items are for the operator to fill in before launch.
const OPERATOR = "ARCK Softworks";
const ADDRESS = "WC1E 6BT";
const CONTACT = "yinjun@arck.industries";
const UPDATED = "26 October 2026";
</script>

<template>
  <div class="strap-rail"></div>
  <main class="app-col legal">
    <header class="profile-top"><router-link to="/" class="wordmark">lanyard<b>.</b></router-link></header>

    <h1>Privacy Policy</h1>
    <p class="muted">Last updated {{ UPDATED }}. This covers people who use Lanyard to carry a card (users) and organisations that run events on it (hosts).</p>

    <h2>1. Who is responsible</h2>
    <p>
      {{ OPERATOR }} ("Lanyard", "we") of {{ ADDRESS }} is the controller of the personal data described here under the
      UK GDPR and the Data Protection Act 2018. Contact us at <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a> for anything about your data.
    </p>

    <h2>2. What we collect</h2>
    <table>
      <thead><tr><th>Who</th><th>Data</th><th>Why</th></tr></thead>
      <tbody>
        <tr><td>Users</td><td>Name, university, course, year, headline, about text, tags, links, profile photo, and whether you show your age band</td><td>To make your card and profile and show them as you choose</td></tr>
        <tr><td>Users</td><td>Connections you make, which card was scanned, optional note, private notes, messages, and shared selfies</td><td>To keep your connections and let both people see them</td></tr>
        <tr><td>Users</td><td>Event check-ins, answers to optional questions, and your optional directory and sponsor choices</td><td>To join events and respect your choices</td></tr>
        <tr><td>Everyone</td><td>Session cookie or device token, passkey public key, hashed recovery key, sign-in codes (short-lived), and records of your terms and consent choices</td><td>To keep you signed in, secure your account, and prove what you agreed to</td></tr>
        <tr><td>Everyone</td><td>IP address and basic request data, kept briefly in rate-limit counters and security logs</td><td>To stop abuse and guessing of codes</td></tr>
        <tr><td>Hosts</td><td>Organisation name and type, billing email, team members and roles, events you create, credits and invoice requests</td><td>To run the host portal and bill you</td></tr>
      </tbody>
    </table>
    <p>
      We do not ask for sensitive ("special category") data. Please do not put it in your profile, notes or event questions.
      We do not buy data about you and we do not use advertising or tracking cookies.
    </p>

    <h2>3. Why we may use it (lawful bases)</h2>
    <ul>
      <li><b>Contract</b>: running your account, card, connections and events, which you asked us to provide.</li>
      <li><b>Consent</b>: shared selfies, appearing in an event directory, and sharing details with a named sponsor. You can withdraw these at any time and it is as easy to withdraw as to give.</li>
      <li><b>Legitimate interests</b>: keeping the service secure, preventing abuse, and counting usage in aggregate. We weigh this against your rights and you can object.</li>
      <li><b>Legal obligation</b>: keeping financial records, and responding to lawful requests.</li>
    </ul>

    <h2>4. Who sees your data</h2>
    <ul>
      <li><b>Other users</b> see what is on the card you share, and what you choose to show in a connection. A private profile shows only a limited view.</li>
      <li><b>Hosts</b> only receive anonymous, aggregated figures about their events. They are not told who attended by name or who connected with whom. Sponsors only receive details you opted in to share with that named sponsor.</li>
      <li><b>Our service providers</b> process data for us under contract. Today that is Cloudflare, which hosts the app, database and image storage. If we add payments or email, we will name those providers here first.</li>
      <li>We may disclose data where the law requires it, or to protect people from serious harm.</li>
      <li>We never sell your data.</li>
    </ul>

    <h2>5. Transfers outside the UK</h2>
    <p>
      Our providers may process data outside the UK. Where they do, we rely on the UK's approved safeguards, such as the
      UK International Data Transfer Addendum or adequacy regulations, and contract terms that protect your data.
    </p>

    <h2>6. How long we keep it</h2>
    <table>
      <thead><tr><th>Data</th><th>Kept for</th></tr></thead>
      <tbody>
        <tr><td>Profile, card, connections, notes</td><td>Until you delete them or your account</td></tr>
        <tr><td>Shared selfies</td><td>Until either person deletes the connection, and no more than 12 months after it was taken</td></tr>
        <tr><td>Sign-in codes</td><td>5 minutes, single use</td></tr>
        <tr><td>Rate-limit counters, expired sessions</td><td>Days; removed automatically</td></tr>
        <tr><td>Unclaimed guest sessions with no profile</td><td>Removed automatically after a period of inactivity</td></tr>
        <tr><td>Consent and terms records</td><td>While your account exists, then up to 6 years as proof of what you agreed to</td></tr>
        <tr><td>Host invoices and billing records</td><td>6 years, as the law requires</td></tr>
      </tbody>
    </table>

    <h2>7. Your rights</h2>
    <p>Under UK data protection law you can:</p>
    <ul>
      <li>get a copy of your data. In <router-link to="/app/settings">Settings</router-link> you can download it;</li>
      <li>correct it. Edit your profile at any time;</li>
      <li>delete it. Settings lets you delete your account, which removes your profile, photos, connections and selfies;</li>
      <li>withdraw consent, object to our use of your data based on legitimate interests, and ask us to limit its use;</li>
      <li>take your data to another service, using the download;</li>
      <li>not be subject to decisions made only by automated means with legal or similar effects. We do not make any.</li>
    </ul>
    <p>
      Hosts can use the same rights for their own account data by emailing us. To use any right, use Settings or email
      <a :href="`mailto:${CONTACT}`">{{ CONTACT }}</a>. We aim to reply within one month. If you are unhappy with how we handled your data,
      you can complain to the Information Commissioner's Office (<a href="https://ico.org.uk" rel="noopener">ico.org.uk</a>, 0303 123 1113).
    </p>

    <h2>8. Shared selfies and other people's data</h2>
    <p>
      A shared selfie can show someone else. We store it only because both people connected, and either of them can
      delete it, which deletes it for both. If you appear in a photo you did not agree to, tell us and we will remove it.
    </p>

    <h2>9. Children</h2>
    <p>
      Lanyard is for people aged 18 and over. We ask you to confirm this when you create a profile. If we find out
      someone under 18 has an account we will delete it.
    </p>

    <h2>10. Security</h2>
    <p>
      Connections use HTTPS. Sign-in codes are short, single use and rate-limited; recovery keys are stored only as a one-way
      hash. Hosts see only aggregates, with small groups hidden. No system is perfectly secure. If a breach puts your
      rights at risk we will tell you and the ICO as the law requires.
    </p>

    <h2>11. Cookies and similar storage</h2>
    <p>
      We use a single strictly necessary cookie to keep you signed in, and the browser's local storage for a few settings
      that make the app work on your device (for example, remembering a dismissed hint). These do not need consent
      because the service cannot work without them. We do not use analytics, advertising or tracking cookies. If we ever
      add any, we will ask first with a clear choice, and update this section before we do.
    </p>

    <h2>12. Changes</h2>
    <p>
      We will update this policy as the service changes. The date above shows the latest version. If a change affects how
      we use your data in a way you would not expect, we will tell you in the app before it takes effect.
    </p>

    <p class="muted" style="margin-top:32px">
      <router-link to="/terms">Terms of Service</router-link> · <router-link to="/terms#hosts">Host terms</router-link> · <router-link to="/">Home</router-link>
    </p>
  </main>
</template>
