import PolicyLayout from "@/app/_components/PolicyLayout";

export const metadata = {
  title: "Refund Policy — alpo.ai",
  description: "When and how to request a refund from alpo.ai.",
};

export default function RefundPage() {
  return (
    <PolicyLayout title="Refund Policy" effectiveDate="21 April 2026">
      <p>
        We want you to be confident when you subscribe to a paid plan on{" "}
        <strong>alpo.ai</strong>. This policy explains when and how you can
        request a refund. It applies to all paid subscriptions (Starter
        monthly, Starter annual, and any future paid plans) purchased through
        our Merchant of Record, <strong>Paddle.com Market Ltd</strong>
        (&ldquo;Paddle&rdquo;).
      </p>

      <h2>1. 14-day satisfaction guarantee</h2>
      <p>
        New paid subscribers may request a full refund within{" "}
        <strong>14 calendar days</strong> of their first payment, for any
        reason. This covers Starter monthly and the first month of a Starter
        annual plan. Contact us at{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a> within the 14-day
        window and we will approve the refund without further questions.
      </p>

      <h2>2. Annual plans</h2>
      <p>
        If you requested an annual plan and cancel after the 14-day window
        but before the end of the annual term, you may request a prorated
        refund for the unused full months remaining. We process the refund
        through Paddle, who will return the amount to your original payment
        method.
      </p>

      <h2>3. Monthly plans after 14 days</h2>
      <p>
        After the 14-day window, monthly subscriptions are not refundable.
        Cancelling takes effect at the end of the current billing period and
        you continue to have access until that date.
      </p>

      <h2>4. Exceptional cases</h2>
      <p>
        If you experienced a service failure (for example, the scanner was
        unavailable for an extended period or a persistent bug prevented you
        from using features you paid for), contact{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a> and we will work
        with you on a fair resolution, which may include a prorated credit or
        refund outside the normal windows described above.
      </p>

      <h2>5. How to request a refund</h2>
      <ol>
        <li>
          Email <a href="mailto:support@alpo.ai">support@alpo.ai</a> from the
          address associated with your alpo.ai account.
        </li>
        <li>
          Include your order or transaction ID (you can find it in the
          receipt Paddle emailed you at purchase).
        </li>
        <li>
          Tell us briefly what happened — any detail you can share helps us
          improve the product.
        </li>
      </ol>
      <p>
        We acknowledge refund requests within two (2) business days and, once
        approved, Paddle returns the funds to the original payment method.
        Paddle typically completes the refund within 5–10 business days
        depending on your bank or card issuer.
      </p>

      <h2>6. Statutory rights</h2>
      <p>
        Nothing in this policy limits any mandatory rights you have under
        applicable consumer-protection law, including the EU/UK 14-day
        right of withdrawal for distance contracts. Where statutory rights
        apply, they are in addition to — not instead of — the terms above.
      </p>

      <h2>7. Chargebacks</h2>
      <p>
        Please contact <a href="mailto:support@alpo.ai">support@alpo.ai</a>{" "}
        before initiating a chargeback; most issues can be resolved
        directly and much faster. If a chargeback is filed, we may suspend
        the associated account pending resolution.
      </p>

      <h2>8. Contact</h2>
      <p>
        All refund requests and related questions:{" "}
        <a href="mailto:support@alpo.ai">support@alpo.ai</a>.
      </p>
    </PolicyLayout>
  );
}
