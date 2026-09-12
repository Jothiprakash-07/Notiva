import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

type Props = {
  visible: boolean;
  title?: string;
  itemTitle?: string;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (completionNote?: string) => Promise<void> | void;
};

export default function CompletionNoteModal({ visible, title = "Mark as Done", itemTitle, saving = false, onClose, onConfirm }: Props) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const busy = saving || submitting;

  useEffect(() => {
    if (visible) setNote("");
  }, [visible]);

  const close = () => {
    if (!saving && !submittingRef.current) onClose();
  };
  const confirm = async (includeNote: boolean) => {
    if (!visible || saving || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await onConfirm(includeNote ? note.trim() || undefined : undefined);
    } catch (error) {
      Alert.alert("Could not complete item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView style={{ width: "100%" }} contentContainerStyle={{ flexGrow: 1, justifyContent: "center", alignItems: "center", paddingVertical: 20 }} keyboardShouldPersistTaps="handled">
          <View style={styles.modalCard} accessibilityViewIsModal>
            <View style={styles.modalIcon}><Ionicons name="checkmark-circle-outline" size={28} color="#4d3fe6" /></View>
            <Text style={styles.modalTitle}>{title}</Text>
            {itemTitle ? <Text style={styles.modalDescription} numberOfLines={2}>{itemTitle}</Text> : null}
            <Text style={styles.modalDescription}>Add a completion note if you want. This note is optional.</Text>
            <TextInput accessibilityLabel="Completion note" value={note} onChangeText={setNote} placeholder="What did you complete?" placeholderTextColor="#a1a1aa" multiline maxLength={300} editable={!busy} style={styles.noteInput} textAlignVertical="top" />
            <Text style={styles.characterCount}>{note.length}/300</Text>
            <View style={styles.modalButtons}>
              <Pressable accessibilityRole="button" disabled={busy} style={[styles.skipButton, busy && styles.buttonDisabled]} onPress={() => { void confirm(false); }}><Text style={styles.skipButtonText}>Skip Note</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={busy} style={[styles.doneButton, busy && styles.buttonDisabled]} onPress={() => { void confirm(true); }}>
                <Ionicons name="checkmark" size={18} color="#ffffff" /><Text style={styles.doneButtonText}>{busy ? "Saving..." : "Done"}</Text>
              </Pressable>
            </View>
            <Pressable accessibilityRole="button" disabled={busy} onPress={close} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,

      backgroundColor:
        "rgba(23,19,41,0.55)",

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingHorizontal: 22,
    },

    modalCard: {
      width: "100%",

      maxWidth: 420,

      backgroundColor:
        "#ffffff",

      borderRadius: 22,

      padding: 20,

      shadowColor:
        "#171329",

      shadowOpacity: 0.18,

      shadowRadius: 18,

      shadowOffset: {
        width: 0,
        height: 8,
      },

      elevation: 10,
    },

    modalIcon: {
      width: 52,
      height: 52,

      borderRadius: 17,

      backgroundColor:
        "#efedff",

      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom: 14,
    },

    modalTitle: {
      color:
        "#171329",

      fontSize: 20,

      lineHeight: 26,

      fontWeight:
        "900",
    },

    modalDescription: {
      color:
        "#7c818d",

      fontSize: 12,

      lineHeight: 18,

      fontWeight:
        "600",

      marginTop: 5,

      marginBottom: 15,
    },

    noteInput: {
      minHeight: 105,

      maxHeight: 150,

      borderRadius: 14,

      borderWidth: 1,

      borderColor:
        "#ddd9ee",

      backgroundColor:
        "#faf9ff",

      paddingHorizontal: 13,

      paddingVertical: 12,

      color:
        "#171329",

      fontSize: 13,

      lineHeight: 20,
    },

    characterCount: {
      color:
        "#a1a1aa",

      fontSize: 9,

      fontWeight:
        "600",

      textAlign:
        "right",

      marginTop: 5,
    },

    modalButtons: {
      flexDirection:
        "row",

      gap: 9,

      marginTop: 15,
    },

    skipButton: {
      flex: 1,

      minHeight: 49,

      borderRadius: 13,

      borderWidth: 1,

      borderColor:
        "#dedbe9",

      backgroundColor:
        "#f7f7fa",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    skipButtonText: {
      color:
        "#636674",

      fontSize: 12,

      fontWeight:
        "800",
    },

    doneButton: {
      flex: 1,

      minHeight: 49,

      borderRadius: 13,

      backgroundColor:
        "#4d3fe6",

      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "center",

      gap: 6,
    },

    doneButtonText: {
      color:
        "#ffffff",

      fontSize: 12,

      fontWeight:
        "900",
    },

    cancelButton: {
      minHeight: 40,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginTop: 7,
    },

    cancelText: {
      color:
        "#8a8f9d",

      fontSize: 11,

      fontWeight:
        "700",
    },

    buttonPressed: {
      opacity: 0.82,

      transform: [
        {
          scale: 0.99,
        },
      ],
    },

    buttonDisabled: {
      opacity: 0.55,
    },
  });