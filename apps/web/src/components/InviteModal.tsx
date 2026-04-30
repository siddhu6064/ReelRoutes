import { useState } from "react";

import { useCreateInvite } from "../api/client";

import styles from "./InviteModal.module.css";

interface Props {
  tripId: string;
  userId: string;
  onClose: () => void;
}

export function InviteModal({ tripId, userId, onClose }: Props): React.ReactElement {
  const [role, setRole] = useState<"editor" | "viewer">("viewer");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const createInvite = useCreateInvite();

  function handleGenerate(): void {
    createInvite.mutate(
      { tripId, userId, role },
      {
        onSuccess: (data) => {
          const fullUrl = `${window.location.origin}${data.invite_url}?user_id=USER_ID`;
          setInviteUrl(fullUrl);
        },
      },
    );
  }

  async function handleCopy(): void {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>Invite to Trip</h2>
          <button className={styles.close} onClick={onClose}>
            ✕
          </button>
        </div>

        {!inviteUrl ? (
          <>
            <p className={styles.desc}>Choose a role and generate a shareable invite link.</p>

            <div className={styles.roleGroup}>
              <button
                className={role === "viewer" ? styles.roleActive : styles.role}
                onClick={() => setRole("viewer")}
              >
                <span className={styles.roleName}>Viewer</span>
                <span className={styles.roleDesc}>Can view pins and the map</span>
              </button>

              <button
                className={role === "editor" ? styles.roleActive : styles.role}
                onClick={() => setRole("editor")}
              >
                <span className={styles.roleName}>Editor</span>
                <span className={styles.roleDesc}>Can add, edit, and remove pins</span>
              </button>
            </div>

            <button
              className={styles.generateBtn}
              onClick={handleGenerate}
              disabled={createInvite.isPending}
            >
              {createInvite.isPending ? "Generating…" : "Generate invite link"}
            </button>
          </>
        ) : (
          <>
            <p className={styles.desc}>
              Share this link. Anyone with it can join as a <strong>{role}</strong>.
            </p>

            <div className={styles.linkBox}>
              <code className={styles.link}>{inviteUrl}</code>
              <button
                className={styles.copyBtn}
                onClick={() => {
                  void handleCopy();
                }}
              >
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>

            <p className={styles.note}>
              Replace <code>USER_ID</code> with the recipient&apos;s Clerk user ID, or implement a
              redirect after sign-in.
            </p>

            <button
              className={styles.anotherBtn}
              onClick={() => {
                setInviteUrl(null);
                setCopied(false);
              }}
            >
              Generate another
            </button>
          </>
        )}
      </div>
    </div>
  );
}
