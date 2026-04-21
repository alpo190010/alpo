import PolicyLayout from "@/app/_components/PolicyLayout";

export const metadata = {
  title: "Terms of Service — alpo.ai",
  description: "The terms that govern your use of alpo.ai.",
};

export default function TermsPage() {
  return (
    <PolicyLayout title="Terms of Service" effectiveDate="21 April 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of{" "}
        <strong>alpo.ai</strong> (&ldquo;alpo&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;), a
        web application that analyzes e-commerce product pages and returns
        conversion-optimization recommendations. By creating an account or using
        the service you agree to these Terms.
      </p>

      <h2>1. Who we are</h2>
      <p>
        alpo.ai is operated from Georgia. For any question related to these
        Terms, contact us at{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>

      <h2>2. The service</h2>
      <p>
        You may submit a URL of a product page or storefront you own or
        are authorized to audit. We render the page, compute scores across a
        set of conversion dimensions, and (on paid plans) return a checklist of
        recommended fixes. All analysis is produced from the public HTML of
        the submitted URL; we do not bypass authentication or access private
        areas of any site.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You must create an account to run scans. You are responsible for any
        activity performed with your credentials. You must provide accurate
        information and keep it up to date, and you must be at least 16 years
        old (or the age of digital consent in your country, whichever is
        higher). We may suspend or terminate an account that violates these
        Terms or applicable law.
      </p>

      <h2>4. Plans, payments, and billing</h2>
      <p>
        Paid subscriptions are sold through <strong>Paddle.com Market Ltd</strong>{" "}
        (&ldquo;Paddle&rdquo;), which acts as the Merchant of Record for all
        purchases. Paddle is responsible for processing payments, calculating
        and collecting applicable taxes, issuing receipts, and handling
        payment disputes. Paddle&apos;s{" "}
        <a href="https://www.paddle.com/legal/buyer-terms" rel="noreferrer" target="_blank">
          Buyer Terms
        </a>{" "}
        and{" "}
        <a href="https://www.paddle.com/legal/privacy" rel="noreferrer" target="_blank">
          Privacy Policy
        </a>{" "}
        apply to the purchase itself.
      </p>
      <p>
        Current plans and prices are listed on{" "}
        <a href="/pricing">our pricing page</a>. Paid plans renew automatically
        at the end of each billing period until you cancel. You can cancel at
        any time from your customer portal; cancellation takes effect at the
        end of the current period and you retain access until then.
      </p>

      <h2>5. Free tier usage limits</h2>
      <p>
        The free plan is limited to three (3) scans per calendar month and does
        not include fix recommendations. Usage limits reset on the first of each
        calendar month (UTC). We may change free-tier limits with reasonable
        advance notice.
      </p>

      <h2>6. Acceptable use</h2>
      <ul>
        <li>
          Do not submit URLs you have no right to audit or that would cause
          us to access private or login-gated content.
        </li>
        <li>
          Do not attempt to exceed plan limits by creating multiple accounts,
          script-driving the service, or otherwise circumventing controls.
        </li>
        <li>
          Do not probe, scan, or attempt to disrupt our infrastructure or the
          infrastructure of our providers (Paddle, hosting, analytics).
        </li>
        <li>
          Do not resell, white-label, or commercially redistribute the service
          without a written agreement with us.
        </li>
      </ul>

      <h2>7. Our intellectual property</h2>
      <p>
        alpo.ai, its analyzers, scoring system, branding, and user interface
        are our property and/or licensed to us. You receive only the limited
        right to use the service as described in these Terms.
      </p>
      <p>
        You keep all rights in the URLs and content you submit for analysis.
        You grant us a non-exclusive license to fetch and process that content
        for the purpose of running your analysis and maintaining the service
        (for example, caching store-wide signals for performance).
      </p>

      <h2>8. Service changes and availability</h2>
      <p>
        We work to keep the service available and accurate, but we do not
        guarantee uninterrupted operation or that scores and recommendations
        will produce a specific commercial outcome for your store. We may
        change, add, or remove features at any time.
      </p>

      <h2>9. Disclaimers and liability</h2>
      <p>
        The service is provided <strong>&ldquo;as is&rdquo;</strong> and{" "}
        <strong>&ldquo;as available&rdquo;</strong>. To the maximum extent
        permitted by law, we disclaim all implied warranties, including
        merchantability, fitness for a particular purpose, and
        non-infringement. We are not liable for indirect, incidental, special,
        consequential, or punitive damages, or for lost revenue, profits, or
        data. Our aggregate liability for any claim arising out of these Terms
        or the service shall not exceed the greater of USD 100 or the amount
        you paid us in the twelve (12) months preceding the event giving rise
        to the claim. Nothing in this section limits liability that cannot be
        limited under applicable law.
      </p>

      <h2>10. Termination</h2>
      <p>
        You can delete your account at any time from your account settings or
        by emailing <a href="mailto:support@alpo.ai">support@alpo.ai</a>. We
        may suspend or terminate accounts that violate these Terms or that we
        reasonably believe create security, legal, or commercial risk. Upon
        termination, your access ends and we may delete data associated with
        your account subject to our Privacy Policy.
      </p>

      <h2>11. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of Georgia, without regard to
        conflict-of-laws rules. Disputes arising out of or relating to these
        Terms shall be brought in the competent courts of Tbilisi, Georgia,
        except where mandatory consumer-protection law in your country of
        residence gives you the right to bring proceedings locally.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be
        announced at least fourteen (14) days before they take effect, via
        email to your account address or a prominent notice in-app. Continued
        use of the service after the effective date constitutes acceptance of
        the revised Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions, notices, or legal correspondence should be sent to{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>
    </PolicyLayout>
  );
}
