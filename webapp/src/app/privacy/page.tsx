import PolicyLayout from "@/app/_components/PolicyLayout";

export const metadata = {
  title: "Privacy Policy — alpo.ai",
  description: "How alpo.ai collects, uses, and protects your information.",
};

export default function PrivacyPage() {
  return (
    <PolicyLayout title="Privacy Policy" effectiveDate="21 April 2026">
      <p>
        This Privacy Policy explains what data{" "}
        <strong>alpo.ai</strong> (&ldquo;alpo&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;,
        &ldquo;us&rdquo;) collects, why we collect it, and the rights you have over
        your information. It covers the alpo.ai web application and associated
        services.
      </p>

      <h2>1. Data controller</h2>
      <p>
        alpo.ai is the data controller for personal data processed through the
        service. For any privacy question, contact{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>

      <h2>2. What we collect</h2>
      <h3>Account data</h3>
      <ul>
        <li>Email address, display name, and profile picture (if you sign in with Google).</li>
        <li>A hashed password if you sign up with email and password.</li>
        <li>The account&apos;s role and plan tier.</li>
      </ul>

      <h3>Usage data</h3>
      <ul>
        <li>URLs you submit for analysis and the resulting score data and signals.</li>
        <li>Timestamps, IP address, user-agent, and referring page for abuse prevention and analytics.</li>
        <li>Product-analytics events captured by PostHog (pageviews, button clicks, scan-completed events).</li>
      </ul>

      <h3>Billing data</h3>
      <p>
        Payments are processed by <strong>Paddle.com Market Ltd</strong>
        (&ldquo;Paddle&rdquo;), which acts as the Merchant of Record. Paddle
        collects your name, email, payment instrument details, billing address,
        and tax information. We receive from Paddle only a subscription
        identifier, customer identifier, plan tier, and current period end — no
        card or full payment information. See{" "}
        <a href="https://www.paddle.com/legal/privacy" rel="noreferrer" target="_blank">
          Paddle&apos;s Privacy Policy
        </a>
        .
      </p>

      <h2>3. Why we use it</h2>
      <ul>
        <li><strong>Provide the service</strong> — run analyses you request and store your scans so you can revisit them.</li>
        <li><strong>Operate your account</strong> — sign-in, email verification, password reset, subscription status.</li>
        <li><strong>Billing</strong> — instruct Paddle to process payments and react to the resulting webhooks (tier activation, renewals, cancellation).</li>
        <li><strong>Communication</strong> — send transactional emails (verification, receipts, important service notices).</li>
        <li><strong>Improve the product</strong> — aggregate usage analytics and error monitoring.</li>
        <li><strong>Prevent abuse</strong> — rate-limit, detect fraud, and respond to security incidents.</li>
      </ul>

      <h2>4. Legal bases (EEA / UK)</h2>
      <ul>
        <li><strong>Performance of a contract</strong> — providing the service you signed up for.</li>
        <li><strong>Legitimate interests</strong> — analytics, abuse prevention, security.</li>
        <li><strong>Consent</strong> — marketing communications, non-essential cookies, where required.</li>
        <li><strong>Legal obligation</strong> — tax records, responding to lawful requests.</li>
      </ul>

      <h2>5. Who we share data with</h2>
      <p>
        We use a small set of sub-processors to run the service. Each has a
        contractual obligation to handle your data only for the purposes we
        specify.
      </p>
      <ul>
        <li><strong>Paddle</strong> — payment processing, tax, fraud screening.</li>
        <li><strong>Google</strong> — OAuth sign-in (if you choose it).</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
        <li><strong>OpenRouter / OpenAI</strong> — optional AI analysis features.</li>
        <li><strong>PostHog</strong> — product analytics and session-level insights.</li>
        <li><strong>Our hosting and database providers</strong> — storage and compute for the service itself.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal data and do not share it
        for third-party advertising.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Our sub-processors may store or process data in the United States or
        other countries outside your own. Where required, transfers are
        protected by Standard Contractual Clauses or another lawful
        mechanism.
      </p>

      <h2>7. Retention</h2>
      <p>
        Account and usage data is retained for as long as your account is
        active. When you delete your account, we remove your profile and
        scans within thirty (30) days, except records we are legally required
        to retain (for example, tax invoices for up to ten years).
      </p>

      <h2>8. Your rights</h2>
      <p>
        You have the right to access, correct, export, and delete the personal
        data we hold about you. If you are in the EEA, UK, or a jurisdiction
        with equivalent law, you also have the right to object to certain
        processing and to lodge a complaint with your local data-protection
        authority. To exercise any of these rights, email{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>

      <h2>9. Cookies and local storage</h2>
      <p>
        We use strictly necessary cookies for authentication and session
        management. We use PostHog to understand how the product is used; you
        can opt out via the appropriate browser controls or by contacting us.
      </p>

      <h2>10. Children</h2>
      <p>
        The service is not directed at children under 16. If you believe a
        child has provided personal data to us, contact{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a> and we will delete
        it.
      </p>

      <h2>11. Security</h2>
      <p>
        We use industry-standard safeguards including HTTPS, salted password
        hashing, principle-of-least-privilege access controls, and encrypted
        databases. No system is perfectly secure; please contact us promptly
        if you suspect a security issue.
      </p>

      <h2>12. Changes</h2>
      <p>
        We may update this policy from time to time. Material changes will be
        announced at least fourteen (14) days in advance.
      </p>

      <h2>13. Contact</h2>
      <p>
        For any privacy matter, contact{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>
    </PolicyLayout>
  );
}
