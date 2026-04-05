import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import styles from "./FlyoverButton.module.css";

interface FlyoverData {
  flyover_url: string | null;
  type: string;
  pin_count?: number;
  share_url?: string;
  message?: string;
}

interface Props {
  tripId: string;
  userId?: string;
}

export function FlyoverButton({ tripId, userId }: Props): React.JSX.Element {
  const [result, setResult] = useState<FlyoverData | null>(null);
  const [copied, setCopied] = useState(false);

  const generate = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", userId);
      const res = await fetch(`/api/trips/${tripId}/flyover?${params.toString()}`, {
        method: "POST",
      });
      const json = (await res.json()) as { data: FlyoverData };
      return json.data;
    },
    onSuccess: (data) => setResult(data),
  });

  async function handleCopy() {
    if (!result?.flyover_url) return;
    await navigator.clipboard.writeText(result.flyover_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.root}>
      <button
        className={styles.btn}
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
      >
        {generate.isPending ? "⏳ Generating…" : "🎬 Generate flyover"}
      </button>

      {result?.flyover_url && (
        <div className={styles.result}>
          <img src={result.flyover_url} alt="Trip flyover preview" className={styles.preview} />
          <div className={styles.actions}>
            <a
              href={result.flyover_url}
              download="reelroutes-flyover.png"
              className={styles.downloadBtn}
            >
              ⬇ Download
            </a>
            <button className={styles.copyBtn} onClick={handleCopy}>
              {copied ? "✓ Copied" : "🔗 Copy link"}
            </button>
          </div>
          {result.pin_count && (
            <p className={styles.meta}>{result.pin_count} stops · ready to share</p>
          )}
        </div>
      )}

      {result?.message && !result.flyover_url && <p className={styles.msg}>{result.message}</p>}
    </div>
  );
}
