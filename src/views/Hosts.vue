<script setup>
// Host pitch page: what hosts get, early pricing, and the way into the portal.
import { HOST_ORIGIN } from "../lib/site";
const portal = `${HOST_ORIGIN}/host`;
</script>

<template>
  <div class="wide-col stack-2" style="max-width:760px">
    <router-link to="/" class="wordmark wordmark-host"><img src="/host-icon.svg" alt="" />lanyard<b>.</b><small>host</small></router-link>

    <h1 style="font-size:40px;margin-top:24px">
      Know who actually came — and who they met.
    </h1>
    <p class="muted" style="font-size:19px">
      Lanyard replaces sign-in sheets with a QR check-in. Attendees connect with
      a shared selfie; you get a live directory and a report afterwards.
    </p>

    <div class="steps">
      <div class="step"><div><strong>Display one QR.</strong>
        <span class="muted"> Attendees scan to check in — no app, no typing.</span></div></div>
      <div class="step"><div><strong>Watch the room live.</strong>
        <span class="muted"> Check-in count and connections as they happen.</span></div></div>
      <div class="step"><div><strong>Get the report.</strong>
        <span class="muted"> Attendance, connections per person, courses and tags — aggregate only.</span></div></div>
    </div>

    <div class="btn-row">
      <a :href="portal" class="btn btn-primary">Open the host portal</a>
    </div>

    <h2 style="margin-top:28px">Early pricing</h2>
    <p class="small muted" style="margin:0">
      Attendees always use Lanyard for free. Student societies and educational
      institutions apply for approval first, using a university email.
    </p>
    <div class="price-grid">
      <div class="price-card featured">
        <strong>Student societies</strong>
        <span class="price">Free</span>
        <span class="per">1 event a week, up to 200 check-ins</span>
        <ul>
          <li>More events: £2.50 each, 5 for £10</li>
          <li>Term pass £12.50, unlimited events</li>
          <li>Live room, album and report</li>
        </ul>
      </div>
      <div class="price-card">
        <strong>Universities and institutions</strong>
        <span class="price">£7.50</span>
        <span class="per">per event of up to 300 check-ins</span>
        <ul>
          <li>5 events £29.50, 15 events £74.50</li>
          <li>Discounted education pricing</li>
          <li>Approval and a university email needed</li>
        </ul>
      </div>
      <div class="price-card">
        <strong>Companies and organisers</strong>
        <span class="price">£12.50</span>
        <span class="per">per event of up to 300 check-ins</span>
        <ul>
          <li>5 events £49.50, 15 events £124.50</li>
          <li>Your branding and perks</li>
          <li>Sponsor opt-in leads</li>
        </ul>
      </div>
      <div class="price-card">
        <strong>Careers services and unions</strong>
        <span class="price">From £150</span>
        <span class="per">per term</span>
        <ul>
          <li>Unlimited events and team seats</li>
          <li>Cohort reports for your funders</li>
          <li>Invoice or purchase order</li>
        </ul>
      </div>
      <div class="price-card">
        <strong>Enterprise</strong>
        <span class="price">Talk to us</span>
        <span class="per">annual licence or per attendee</span>
        <ul>
          <li>Your own subdomain and branding</li>
          <li>Data processing agreement, SSO</li>
          <li>Integrations (CRM, ticketing)</li>
        </ul>
      </div>
    </div>

    <p class="small muted">
      Privacy: hosts see aggregate analytics, never who connected with whom.
      Sponsor sharing is opt-in per sponsor.
      <router-link to="/terms#hosts">Host terms</router-link> · <router-link to="/privacy">Privacy Policy</router-link>
    </p>
  </div>
</template>
