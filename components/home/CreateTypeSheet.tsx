import Ionicons from "@expo/vector-icons/Ionicons";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { ItemType } from "../../types/item";

const options: { type: ItemType; title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "reminder", title: "Reminder", subtitle: "Set a personal reminder", icon: "notifications-outline" },
  { type: "task", title: "Task", subtitle: "Create a task with due date", icon: "checkbox-outline" },
  { type: "event", title: "Event", subtitle: "Add an event with start/end time", icon: "calendar-outline" },
  { type: "birthday", title: "Birthday", subtitle: "Remember special days", icon: "gift-outline" },
];

export default function CreateTypeSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (type: ItemType) => void }) {
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
    <Pressable style={styles.overlay} onPress={onClose}><Pressable style={styles.sheet} onPress={(event) => event.stopPropagation()}>
      <View style={styles.heading}><Text style={styles.title}>Create new</Text><Pressable onPress={onClose}><Ionicons name="close" size={25} color="#111827" /></Pressable></View>
      {options.map((option) => <Pressable key={option.type} style={styles.option} onPress={() => onSelect(option.type)}>
        <View style={styles.icon}><Ionicons name={option.icon} size={22} color="#4d3fe6" /></View><View style={styles.copy}><Text style={styles.optionTitle}>{option.title}</Text><Text style={styles.subtitle}>{option.subtitle}</Text></View><Ionicons name="chevron-forward" size={19} color="#9ca3af" />
      </Pressable>)}
    </Pressable></Pressable>
  </Modal>;
}

const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.45)" }, sheet: { backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 34 }, heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }, title: { fontSize: 21, fontWeight: "900", color: "#111827" }, option: { flexDirection: "row", alignItems: "center", paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "#f1f1f5" }, icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: "#f0efff", justifyContent: "center", alignItems: "center", marginRight: 12 }, copy: { flex: 1 }, optionTitle: { fontSize: 15, fontWeight: "800", color: "#111827" }, subtitle: { fontSize: 12, color: "#8b8b98", marginTop: 3 } });
