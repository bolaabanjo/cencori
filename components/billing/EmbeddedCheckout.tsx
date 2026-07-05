"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

interface EmbeddedCheckoutProps {
  checkoutUrl: string;
  onSuccess?: () => void;
  onClose?: () => void;
}

export function EmbeddedCheckout({
  checkoutUrl,
  onSuccess,
  onClose,
}: EmbeddedCheckoutProps) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!checkoutUrl) return;

    const timer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    window.location.href = checkoutUrl;

    return () => clearTimeout(timer);
  }, [checkoutUrl]);

  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Redirecting to secure checkout...
        </p>
        {!loading && (
          <a
            href={checkoutUrl}
            className="text-sm text-primary underline underline-offset-2"
          >
            Click here if you are not redirected
          </a>
        )}
      </div>
    </div>
  );
}
