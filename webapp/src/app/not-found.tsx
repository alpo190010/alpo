import Link from "next/link";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/dist/ssr";
import Button from "@/components/ui/Button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6 anim-phase-enter">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--brand)]/10 flex items-center justify-center">
          <MagnifyingGlassIcon size={28} weight="regular" color="var(--brand)" />
        </div>
        <div>
          <p className="font-display text-6xl font-extrabold text-[var(--text-primary)] mb-4 tracking-tight">
            404
          </p>
          <h1 className="font-display text-xl font-bold text-[var(--text-primary)] mb-2">
            Page not found
          </h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>
        <div className="flex justify-center">
          <Button asChild shape="pill">
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
