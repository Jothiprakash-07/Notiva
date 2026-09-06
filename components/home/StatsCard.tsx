import { Image, ImageSourcePropType, Pressable, StyleSheet, Text } from "react-native";

type StatsCardProps = {
  icon: ImageSourcePropType;
  count: number;
  label: string;
  variant: "total" | "done" | "overdue";
  onPress: () => void;
};

export default function StatsCard({
  icon,
  count,
  label,
  variant,
  onPress,
}: StatsCardProps) {
  const countColor =
    variant === "done"
      ? "#22c55e"
      : variant === "overdue"
      ? "#ef4444"
      : "#4d3fe6";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`View ${label.toLowerCase()} items`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Image source={icon} style={styles.icon} resizeMode="contain" />

      <Text allowFontScaling={false} style={[styles.count, { color: countColor }]}>
        {String(count).padStart(2, "0")}
      </Text>

      <Text allowFontScaling={false} style={styles.label}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minHeight: 112,
    backgroundColor: "#ffffff",
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,

    shadowColor: "#000000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },

  cardPressed: {
    opacity: 0.82,
  },

  icon: {
    width: 32,
    height: 32,
    marginBottom: 8,
  },

  count: {
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 2,
  },

  label: {
    color: "#8b8b8b",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});
