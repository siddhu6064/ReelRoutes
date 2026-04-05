import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import styles from "./TravelBookCTA.module.css";

interface PrintSpecs {
  format: string;
  color: string;
  paper: string;
  suggested_vendor: string;
  vendor_api_docs: string;
}

interface BookData {
  page_count: number;
  title: string;
  print_specs: PrintSpecs;
  preview_url: string;
}

interface Props {
  tripId: string;
  userId?: string;
}

export function TravelBookCTA({ tripId, userId }: Props): React.JSX.Element {
  const [book, setBook] = useState<BookData | null>(null);

  const generate = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set("user_id", userId);
      const res = await fetch(`/api/trips/${tripId}/book?${params.toString()}`, { method: "POST" });
      const json = (await res.json()) as { data: BookData };
      return json.data;
    },
    onSuccess: setBook,
  });

  if (book) {
    return (
      <div className={styles.result}>
        <div className={styles.bookIcon}>📖</div>
        <h3 className={styles.bookTitle}>{book.title}</h3>
        <p className={styles.bookMeta}>
          {book.page_count} pages · {book.print_specs.format}&quot; ·{" "}
          {book.print_specs.color.replace("_", " ")} · {book.print_specs.paper}
        </p>

        <div className={styles.specs}>
          <div className={styles.specRow}>
            <span className={styles.specLabel}>Recommended printer</span>
            <span className={styles.specValue}>{book.print_specs.suggested_vendor}</span>
          </div>
          <div className={styles.specRow}>
            <span className={styles.specLabel}>Format</span>
            <span className={styles.specValue}>{book.print_specs.format}&quot;</span>
          </div>
          <div className={styles.specRow}>
            <span className={styles.specLabel}>Paper</span>
            <span className={styles.specValue}>{book.print_specs.paper}</span>
          </div>
        </div>

        <div className={styles.actions}>
          <a
            href={book.print_specs.vendor_api_docs}
            target="_blank"
            rel="noreferrer"
            className={styles.printBtn}
          >
            🖨 Order from {book.print_specs.suggested_vendor}
          </a>
          <button className={styles.regenerateBtn} onClick={() => setBook(null)}>
            Regenerate
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.cta}>
      <div className={styles.ctaIcon}>📖</div>
      <h3 className={styles.ctaTitle}>Print your trip as a book</h3>
      <p className={styles.ctaDesc}>
        Turn your trip into a beautifully formatted travel guide — title page, day-by-day stops with
        notes, full-route map, and credits. Ready to send to print-on-demand services like Lulu or
        Blurb.
      </p>
      <button
        className={styles.ctaBtn}
        onClick={() => generate.mutate()}
        disabled={generate.isPending}
      >
        {generate.isPending ? "⏳ Generating layout…" : "📖 Generate travel book"}
      </button>
    </div>
  );
}
