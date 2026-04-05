import { useState } from "react";

import { type Collaborator, useCollaborators, useRemoveCollaborator } from "../api/client";

import styles from "./CollaboratorAvatars.module.css";
import { InviteModal } from "./InviteModal";

interface Props {
  tripId: string;
  userId: string;
  isOwner: boolean;
}

function Avatar({ clerk_id, role }: Pick<Collaborator, "clerk_id" | "role">) {
  const initials = (clerk_id ?? "??").slice(0, 2).toUpperCase();
  return (
    <div
      className={role === "editor" ? styles.avatarEditor : styles.avatarViewer}
      title={`${clerk_id} (${role})`}
    >
      {initials}
    </div>
  );
}

export function CollaboratorAvatars({ tripId, userId, isOwner }: Props) {
  const [showInvite, setShowInvite] = useState(false);
  const { data, isLoading } = useCollaborators(tripId, userId);
  const remove = useRemoveCollaborator();

  if (isLoading || !data) return null;

  const { collaborators, pending_count } = data;

  return (
    <div className={styles.root}>
      <div className={styles.avatars}>
        {collaborators.slice(0, 5).map((c) => (
          <Avatar key={c.clerk_id} clerk_id={c.clerk_id} role={c.role} />
        ))}

        {collaborators.length > 5 && (
          <div className={styles.overflow}>+{collaborators.length - 5}</div>
        )}

        {pending_count > 0 && (
          <div className={styles.pending} title={`${pending_count} invite(s) pending`}>
            {pending_count} pending
          </div>
        )}
      </div>

      {isOwner && (
        <button className={styles.inviteBtn} onClick={() => setShowInvite(true)}>
          + Invite
        </button>
      )}

      {collaborators.length > 0 && isOwner && (
        <details className={styles.manageDetails}>
          <summary className={styles.manageSummary}>Manage</summary>
          <div className={styles.manageList}>
            {collaborators.map((c) => (
              <div key={c.clerk_id} className={styles.manageRow}>
                <span className={styles.manageId}>{c.clerk_id}</span>
                <span className={styles.manageRole}>{c.role}</span>
                <button
                  className={styles.removeBtn}
                  onClick={() =>
                    remove.mutate({
                      tripId,
                      userId,
                      collabId: c.id,
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </details>
      )}

      {showInvite && (
        <InviteModal tripId={tripId} userId={userId} onClose={() => setShowInvite(false)} />
      )}
    </div>
  );
}
