"use client";

import Button from "@/components/ui/Button";
import type { ButtonProps } from "@/components/ui/Button";

type ScrollToCTAProps = Omit<ButtonProps, "onClick">;

export default function ScrollToCTA({ children, ...rest }: ScrollToCTAProps) {
  return (
    <Button
      {...rest}
      onClick={() => {
        document.getElementById("url-input")?.focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
    >
      {children}
    </Button>
  );
}
