import { priorityColors, statusColors } from "../../constants/itemColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ItemStatus, ItemType, Priority } from "../../types/item";

type ReminderCardProps = {
  id: string;
  priority?: Priority;
  title: string;
  time: string;
  date: string;
  category: string;
  status: ItemStatus;
  type: ItemType;
  onPress: () => void;
  onToggle?: () => void;
};

export default function ReminderCard({
  priority,
  title,
  time,
  date,
  category,
  status,
  type,
  onPress,
  onToggle,
}: ReminderCardProps) {
  const colors = statusColors[status];

  return (
    <Pressable style={styles.card} onPress={onPress}>
      {/* Left status line */}
      <View style={[styles.leftLine, { backgroundColor: colors.color }]} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          {((type === "reminder" || type === "task") && (status === "Pending" || status === "Done")) ? <Pressable accessibilityRole="checkbox" accessibilityLabel="Mark done" accessibilityState={{ checked: status === "Done", disabled: status === "Done" }} disabled={status === "Done"} style={styles.checkbox} onPress={(event) => { event.stopPropagation(); if (status === "Pending") onToggle?.(); }}><Ionicons name={status === "Done" ? "checkmark-circle" : "ellipse-outline"} size={21} color={status === "Done" ? "#22c55e" : "#9ca3af"} /></Pressable> : null}
          <Text
            allowFontScaling={false}
            style={styles.title}
            numberOfLines={1}
          >
            {title}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: colors.backgroundColor }]}>
            <Text
              allowFontScaling={false}
              style={[styles.statusText, { color: colors.color }]}
            >
              {status}
            </Text>
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaGroup}>
            <View style={styles.metaItem}>
              <Ionicons
                name="time-outline"
                size={15}
                color="#9ca3af"
              />

              <Text
                allowFontScaling={false}
                style={styles.metaText}
              >
                {time}
              </Text>
            </View>

            <View style={styles.metaItem}>
              <Ionicons
                name="calendar-outline"
                size={15}
                color="#9ca3af"
              />

              <Text
                allowFontScaling={false}
                style={styles.metaText}
              >
                {date}
              </Text>
            </View>

            {priority ? <Text style={[styles.priorityBadge, priorityColors[priority]]}>{priority}</Text> : null}
            <View style={styles.categoryBadge}>
              <Text
                allowFontScaling={false}
                style={styles.categoryText}
                numberOfLines={1}
              >
            {category} • {type[0].toUpperCase() + type.slice(1)}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    minHeight: 88,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    marginBottom: 10,
    flexDirection: "row",
    overflow: "hidden",

    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    elevation: 3,
  },

  leftLine: {
    width: 4,
  },

doneLine: {
    backgroundColor: "#22c55e",
  },

content: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 14,
  },

  checkbox: {
    marginRight: 7,
    justifyContent: "center",
  },

  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
  },

  title: {
    flex: 1,
    color: "#111827",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 20,
  },

  statusBadge: {
    minWidth: 62,
    height: 23,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 9,
  },

doneBadge: {
    backgroundColor: "#a7f3c6",
  },

statusText: {
    color: "#4d3fe6",
    fontSize: 10,
    fontWeight: "900",
  },

  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
  },

  metaGroup: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    flex: 1,
    rowGap: 6,
    columnGap: 8,
  },

  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
  },

  metaText: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "600",
  },

  priorityBadge: { fontSize: 10, fontWeight: "800", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 9, overflow: "hidden" },

  categoryBadge: {
    minWidth: 44,
    maxWidth: 74,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#dedbff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 7,
  },

  categoryText: {
    color: "#4d3fe6",
    fontSize: 9,
    fontWeight: "900",
  },
});
