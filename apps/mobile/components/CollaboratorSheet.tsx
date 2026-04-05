import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Vibration,
} from "react-native";

import {
  type Collaborator,
  type InviteResponse,
  useCollaborators,
  useCreateInvite,
  useRemoveCollaborator,
} from "../api/client";

interface AvatarProps {
  clerk_id: string | null;
  role: "editor" | "viewer";
}

function Avatar({ clerk_id, role }: AvatarProps) {
  const initials = (clerk_id ?? "??").slice(0, 2).toUpperCase();
  return (
    <View style={role === "editor" ? styles.avatarEditor : styles.avatarViewer}>
      <Text style={styles.avatarText}>{initials}</Text>
    </View>
  );
}

interface Props {
  tripId: string;
  userId: string;
  isOwner: boolean;
  visible: boolean;
  onClose: () => void;
}

export function CollaboratorSheet({ tripId, userId, isOwner, visible, onClose }: Props) {
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);

  const { data, isLoading } = useCollaborators(tripId, userId);
  const createInvite = useCreateInvite();
  const removeCollab = useRemoveCollaborator();

  const collaborators: Collaborator[] = data?.collaborators ?? [];
  const pendingCount = data?.pending_count ?? 0;

  function handleGenerateInvite() {
    createInvite.mutate(
      { tripId, userId, role: inviteRole },
      {
        onSuccess: (inv: InviteResponse) => {
          Vibration.vibrate(40);
          setGeneratedUrl(inv.invite_url);
        },
      },
    );
  }

  function handleRemove(collabId: string) {
    removeCollab.mutate({ tripId, userId, collabId });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      <View style={styles.sheet}>
        {/* Handle */}
        <View style={styles.handle} />

        <View style={styles.header}>
          <Text style={styles.title}>Collaborators</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Avatar row */}
          {collaborators.length > 0 && (
            <View style={styles.avatarRow}>
              {collaborators.map((c) => (
                <Avatar key={c.id} clerk_id={c.clerk_id} role={c.role} />
              ))}
              {pendingCount > 0 && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingText}>{pendingCount} pending</Text>
                </View>
              )}
            </View>
          )}

          {isLoading && <ActivityIndicator style={styles.loader} color="#d85a30" />}

          {/* Collaborator list */}
          {collaborators.map((c) => (
            <View key={c.id} style={styles.collabRow}>
              <View style={styles.collabInfo}>
                <Text style={styles.collabId} numberOfLines={1}>
                  {c.clerk_id ?? "(pending)"}
                </Text>
                <Text style={styles.collabRole}>{c.role}</Text>
              </View>
              {isOwner && (
                <Pressable style={styles.removeBtn} onPress={() => handleRemove(c.id)}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              )}
            </View>
          ))}

          {collaborators.length === 0 && !isLoading && (
            <Text style={styles.emptyText}>No collaborators yet. Invite someone below.</Text>
          )}

          {/* Invite section (owner only) */}
          {isOwner && (
            <View style={styles.inviteSection}>
              <Text style={styles.inviteTitle}>Invite to trip</Text>

              <View style={styles.roleRow}>
                <Pressable
                  style={inviteRole === "viewer" ? styles.roleActive : styles.role}
                  onPress={() => setInviteRole("viewer")}
                >
                  <Text style={inviteRole === "viewer" ? styles.roleActiveText : styles.roleText}>
                    Viewer
                  </Text>
                </Pressable>
                <Pressable
                  style={inviteRole === "editor" ? styles.roleActive : styles.role}
                  onPress={() => setInviteRole("editor")}
                >
                  <Text style={inviteRole === "editor" ? styles.roleActiveText : styles.roleText}>
                    Editor
                  </Text>
                </Pressable>
              </View>

              {generatedUrl ? (
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={2}>
                    {generatedUrl}
                  </Text>
                  <Text style={styles.linkNote}>Share this link with your travel companion.</Text>
                </View>
              ) : (
                <Pressable
                  style={styles.generateBtn}
                  onPress={handleGenerateInvite}
                  disabled={createInvite.isPending}
                >
                  <Text style={styles.generateBtnText}>
                    {createInvite.isPending ? "Generating…" : "Generate invite link"}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: "80%",
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: "#e5e7eb",
    borderRadius: 99,
    alignSelf: "center",
    marginVertical: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#111827" },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 16, color: "#9ca3af" },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
    flexWrap: "wrap",
  },
  avatarEditor: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#d85a30",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarViewer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#6b7280",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontSize: 12, fontWeight: "800" },
  pendingBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "#f3f4f6",
    borderRadius: 99,
  },
  pendingText: { fontSize: 11, color: "#9ca3af", fontWeight: "600" },
  loader: { marginVertical: 20 },
  collabRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  collabInfo: { flex: 1, gap: 2 },
  collabId: { fontSize: 13, color: "#374151", fontFamily: "monospace" },
  collabRole: {
    fontSize: 11,
    color: "#9ca3af",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fef2f2",
  },
  removeBtnText: { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  emptyText: { fontSize: 14, color: "#9ca3af", textAlign: "center", marginVertical: 20 },
  inviteSection: {
    marginTop: 20,
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    gap: 12,
  },
  inviteTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  roleRow: { flexDirection: "row", gap: 10 },
  role: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#e5e7eb",
    backgroundColor: "#fff",
  },
  roleActive: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#d85a30",
    backgroundColor: "#fef3ee",
  },
  roleText: { fontSize: 13, fontWeight: "700", color: "#6b7280" },
  roleActiveText: { fontSize: 13, fontWeight: "700", color: "#d85a30" },
  generateBtn: {
    backgroundColor: "#d85a30",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  generateBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  linkBox: {
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    gap: 6,
  },
  linkText: { fontSize: 11, color: "#374151", fontFamily: "monospace" },
  linkNote: { fontSize: 11, color: "#9ca3af" },
});
