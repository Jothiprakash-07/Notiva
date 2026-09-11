import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ItemType } from "../../types/item";

const options: {
  type: ItemType;
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    type: "reminder",
    title: "Reminder",
    subtitle: "Set a personal reminder",
    icon: "notifications-outline",
  },
  {
    type: "task",
    title: "Task",
    subtitle: "Create a task with due date",
    icon: "checkbox-outline",
  },
  {
    type: "event",
    title: "Event",
    subtitle: "Add an event with start and end time",
    icon: "calendar-outline",
  },
  {
    type: "birthday",
    title: "Birthday",
    subtitle: "Remember special days",
    icon: "gift-outline",
  },
];

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (type: ItemType) => void;
};

export default function CreateTypeSheet({
  visible,
  onClose,
  onSelect,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable
        style={styles.overlay}
        onPress={onClose}
      >
        <Pressable
          style={styles.sheet}
          onPress={(event) =>
            event.stopPropagation()
          }
        >
          {/* Drag handle */}
          <View style={styles.handleWrap}>
            <View style={styles.handle} />
          </View>

          {/* Header */}
          <View style={styles.heading}>
            <View style={styles.headingCopy}>
              <Text style={styles.title}>
                Create new
              </Text>

              <Text style={styles.headingSubtitle}>
                Choose what you want to create
              </Text>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close create menu"
              hitSlop={10}
              style={({ pressed }) => [
                styles.closeButton,
                pressed &&
                  styles.closePressed,
              ]}
              onPress={onClose}
            >
              <Ionicons
                name="close"
                size={22}
                color="#4b5563"
              />
            </Pressable>
          </View>

          {/* Options */}
          <View style={styles.options}>
            {options.map(
              (option) => (
                <Pressable
                  key={option.type}
                  accessibilityRole="button"
                  accessibilityLabel={`Create ${option.title}`}
                  style={({ pressed }) => [
                    styles.option,
                    pressed &&
                      styles.optionPressed,
                  ]}
                  onPress={() =>
                    onSelect(
                      option.type
                    )
                  }
                >
                  <View
                    style={
                      styles.iconWrap
                    }
                  >
                    <Ionicons
                      name={
                        option.icon
                      }
                      size={23}
                      color="#4d3fe6"
                    />
                  </View>

                  <View
                    style={
                      styles.copy
                    }
                  >
                    <Text
                      style={
                        styles.optionTitle
                      }
                    >
                      {
                        option.title
                      }
                    </Text>

                    <Text
                      style={
                        styles.subtitle
                      }
                    >
                      {
                        option.subtitle
                      }
                    </Text>
                  </View>

                  <View
                    style={
                      styles.arrowWrap
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#7c818d"
                    />
                  </View>
                </Pressable>
              )
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,

    justifyContent: "flex-end",

    backgroundColor:
      "rgba(20,16,48,0.52)",
  },

  sheet: {
    width: "100%",

    backgroundColor: "#ffffff",

    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,

    paddingHorizontal: 18,
    paddingTop: 9,
    paddingBottom: 30,

    shadowColor: "#171329",
    shadowOpacity: 0.15,
    shadowRadius: 16,

    shadowOffset: {
      width: 0,
      height: -5,
    },

    elevation: 12,
  },

  handleWrap: {
    width: "100%",

    alignItems: "center",

    paddingBottom: 10,
  },

  handle: {
    width: 42,
    height: 4,

    borderRadius: 2,

    backgroundColor: "#d8d8df",
  },

  heading: {
    flexDirection: "row",

    alignItems: "flex-start",

    justifyContent:
      "space-between",

    gap: 14,

    marginBottom: 18,
  },

  headingCopy: {
    flex: 1,
    minWidth: 0,
  },

  title: {
    color: "#171329",

    fontSize: 22,
    lineHeight: 28,

    fontWeight: "900",
  },

  headingSubtitle: {
    color: "#8b8f9c",

    fontSize: 12,
    lineHeight: 18,

    fontWeight: "600",

    marginTop: 3,
  },

  closeButton: {
    width: 38,
    height: 38,

    borderRadius: 12,

    backgroundColor: "#f3f4f6",

    alignItems: "center",
    justifyContent: "center",
  },

  closePressed: {
    opacity: 0.7,
  },

  options: {
    gap: 10,
  },

  option: {
    width: "100%",

    minHeight: 76,

    borderRadius: 17,

    borderWidth: 1,
    borderColor: "#eceaf7",

    backgroundColor: "#fafaff",

    flexDirection: "row",

    alignItems: "center",

    paddingHorizontal: 13,
    paddingVertical: 11,
  },

  optionPressed: {
    opacity: 0.82,

    transform: [
      {
        scale: 0.995,
      },
    ],
  },

  iconWrap: {
    width: 48,
    height: 48,

    borderRadius: 15,

    backgroundColor: "#efedff",

    alignItems: "center",
    justifyContent: "center",

    marginRight: 12,
  },

  copy: {
    flex: 1,
    minWidth: 0,
  },

  optionTitle: {
    color: "#171329",

    fontSize: 15,
    lineHeight: 20,

    fontWeight: "900",
  },

  subtitle: {
    color: "#8b8f9c",

    fontSize: 11,
    lineHeight: 17,

    fontWeight: "600",

    marginTop: 3,
  },

  arrowWrap: {
    width: 32,
    height: 32,

    borderRadius: 10,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#ffffff",

    marginLeft: 8,
  },
});