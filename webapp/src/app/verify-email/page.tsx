import { Suspense } from "react";
import Nav from "@/components/Nav";
import { Spinner } from "@/components/ui";
import VerifyEmailContent from "./_components/VerifyEmailContent";

export default function VerifyEmailPage() {
  return (
    <>
      <Nav variant="simple" />
      <Suspense
        fallback={
          <div className="max-w-md mx-auto px-4 py-16 text-center">
            <Spinner />
          </div>
        }
      >
        <VerifyEmailContent />
      </Suspense>
    </>
  );
}
