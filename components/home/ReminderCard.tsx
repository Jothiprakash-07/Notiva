import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import {
  useRef,
} from "react";

import {
  priorityColors,
  statusColors,
} from "../../constants/itemColors";

import {
  ItemStatus,
  ItemType,
  Priority,
} from "../../types/item";

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

  selectionMode?: boolean;

  selected?: boolean;

  onLongPress?: () => void;

  onSelect?: () => void;

  disabled?: boolean;
};

function typeIcon(
  type: ItemType
): keyof typeof Ionicons.glyphMap {
  if (type === "reminder") {
    return "notifications-outline";
  }

  if (type === "task") {
    return "checkbox-outline";
  }

  if (type === "event") {
    return "calendar-outline";
  }

  return "gift-outline";
}

function typeLabel(
  type: ItemType
) {
  return (
    type[0].toUpperCase() +
    type.slice(1)
  );
}

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
  selectionMode = false,
  selected = false,
  onLongPress,
  onSelect,
  disabled = false,
}: ReminderCardProps) {
  const colors =
    statusColors[status];

  const longPressedRef =
    useRef(false);

  const isDone =
    status === "Done";

  const canToggle =
    (
      type === "reminder" ||
      type === "task"
    ) &&
    [
      "Pending",
      "Missed",
      "Overdue",
      "Done",
    ].includes(status);

  /*
   * Full-card long press.
   *
   * This prevents the normal card press
   * from opening Details immediately
   * after a long press.
   */
  const handleLongPress = () => {
    if (
      disabled ||
      selectionMode ||
      !onLongPress
    ) {
      return;
    }

    longPressedRef.current =
      true;

    onLongPress();
  };

  /*
   * Normal press:
   *
   * Selection mode -> select/unselect
   * Normal mode    -> open Details
   */
  const handleCardPress = () => {
    if (disabled) {
      return;
    }

    if (
      longPressedRef.current
    ) {
      longPressedRef.current =
        false;

      return;
    }

    if (selectionMode) {
      onSelect?.();

      return;
    }

    onPress();
  };

  return (
    <Pressable
      accessibilityRole={
        selectionMode
          ? "checkbox"
          : "button"
      }
      accessibilityState={{
        disabled,

        ...(selectionMode
          ? {
              checked:
                selected,
            }
          : {}),
      }}
      disabled={disabled}
      delayLongPress={300}
      onLongPress={
        handleLongPress
      }
      onPress={
        handleCardPress
      }
      style={({
        pressed,
      }) => [
        styles.card,

        selectionMode &&
          selected &&
          styles.selectedCard,

        pressed &&
          styles.cardPressed,
      ]}
    >
      {/* Status line */}
      <View
        style={[
          styles.leftLine,
          {
            backgroundColor:
              colors.color,
          },
        ]}
      />

      <View
        style={
          styles.content
        }
      >
        {/* Top row */}
        <View
          style={
            styles.topRow
          }
        >
          <View
            style={
              styles.titleArea
            }
          >
            {selectionMode ? (
              /*
               * Selection icon.
               * pointerEvents none means
               * the full card receives
               * press/long-press gestures.
               */
              <View
                style={
                  styles.checkbox
                }
                pointerEvents="none"
              >
                <Ionicons
                  name={
                    selected
                      ? "checkbox"
                      : "square-outline"
                  }
                  size={23}
                  color="#4d3fe6"
                />
              </View>
            ) : canToggle ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  isDone
                    ? "Completed"
                    : "Mark as done"
                }
                accessibilityState={{
                  disabled:
                    isDone,
                }}
                disabled={
                  isDone ||
                  disabled
                }
                hitSlop={8}
                delayLongPress={
                  300
                }
                style={
                  styles.checkbox
                }

                /*
                 * Important:
                 * Long pressing the Done area
                 * should ALSO enter selection.
                 */
                onLongPress={(
                  event
                ) => {
                  event.stopPropagation();

                  handleLongPress();
                }}

                onPress={(
                  event
                ) => {
                  event.stopPropagation();

                  /*
                   * If this was a long press,
                   * do not trigger Done.
                   */
                  if (
                    longPressedRef.current
                  ) {
                    longPressedRef.current =
                      false;

                    return;
                  }

                  if (
                    !isDone &&
                    !selectionMode
                  ) {
                    onToggle?.();
                  }
                }}
              >
                <Ionicons
                  name={
                    isDone
                      ? "checkmark-circle"
                      : "ellipse-outline"
                  }
                  size={23}
                  color={
                    isDone
                      ? "#22c55e"
                      : "#9ca3af"
                  }
                />
              </Pressable>
            ) : (
              <View
                style={
                  styles.typeIconSmall
                }
                pointerEvents="none"
              >
                <Ionicons
                  name={typeIcon(
                    type
                  )}
                  size={15}
                  color="#4d3fe6"
                />
              </View>
            )}

            <Text
              allowFontScaling={
                false
              }
              style={[
                styles.title,

                isDone &&
                  styles.doneTitle,
              ]}
              numberOfLines={2}
            >
              {title}
            </Text>
          </View>

          <View
            style={[
              styles.statusBadge,
              {
                backgroundColor:
                  colors.backgroundColor,
              },
            ]}
            pointerEvents="none"
          >
            <Text
              allowFontScaling={
                false
              }
              style={[
                styles.statusText,
                {
                  color:
                    colors.color,
                },
              ]}
              numberOfLines={1}
            >
              {status}
            </Text>
          </View>
        </View>

        {/* Time + Date */}
        <View
          style={
            styles.metaRow
          }
          pointerEvents="none"
        >
          <View
            style={
              styles.metaItem
            }
          >
            <Ionicons
              name="time-outline"
              size={15}
              color="#8b8f9c"
            />

            <Text
              allowFontScaling={
                false
              }
              style={
                styles.metaText
              }
              numberOfLines={1}
            >
              {time}
            </Text>
          </View>

          <View
            style={
              styles.metaDivider
            }
          />

          <View
            style={
              styles.metaItem
            }
          >
            <Ionicons
              name="calendar-outline"
              size={15}
              color="#8b8f9c"
            />

            <Text
              allowFontScaling={
                false
              }
              style={
                styles.metaText
              }
              numberOfLines={1}
            >
              {date}
            </Text>
          </View>
        </View>

        {/* Bottom tags */}
        <View
          style={
            styles.tagsRow
          }
          pointerEvents="none"
        >
          <View
            style={
              styles.categoryBadge
            }
          >
            <Ionicons
              name={typeIcon(
                type
              )}
              size={12}
              color="#4d3fe6"
            />

            <Text
              allowFontScaling={
                false
              }
              style={
                styles.categoryText
              }
              numberOfLines={1}
            >
              {category}
            </Text>
          </View>

          <View
            style={
              styles.typeBadge
            }
          >
            <Text
              allowFontScaling={
                false
              }
              style={
                styles.typeText
              }
              numberOfLines={1}
            >
              {typeLabel(
                type
              )}
            </Text>
          </View>

          {priority ? (
            <Text
              allowFontScaling={
                false
              }
              style={[
                styles.priorityBadge,

                priorityColors[
                  priority
                ],
              ]}
            >
              {priority}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Right indicator */}
      <View
        style={
          styles.chevronArea
        }
        pointerEvents="none"
      >
        {selectionMode ? (
          <Ionicons
            name={
              selected
                ? "checkmark-circle"
                : "ellipse-outline"
            }
            size={20}
            color={
              selected
                ? "#4d3fe6"
                : "#c4c7cf"
            }
          />
        ) : (
          <Ionicons
            name="chevron-forward"
            size={17}
            color="#c4c7cf"
          />
        )}
      </View>
    </Pressable>
  );
}

const styles =
  StyleSheet.create({
    selectedCard: {
      borderColor:
        "#4d3fe6",

      borderWidth: 1.5,

      backgroundColor:
        "#f5f3ff",
    },

    card: {
      width: "100%",

      minHeight: 116,

      backgroundColor:
        "#ffffff",

      borderRadius: 16,

      flexDirection:
        "row",

      alignItems:
        "stretch",

      overflow:
        "hidden",

      borderWidth: 1,

      borderColor:
        "#efedf7",

      shadowColor:
        "#171329",

      shadowOpacity:
        0.055,

      shadowRadius: 8,

      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 2,
    },

    cardPressed: {
      opacity: 0.88,

      transform: [
        {
          scale: 0.995,
        },
      ],
    },

    leftLine: {
      width: 5,
    },

    content: {
      flex: 1,

      paddingLeft: 14,

      paddingRight: 8,

      paddingTop: 15,

      paddingBottom: 14,

      minWidth: 0,
    },

    topRow: {
      flexDirection:
        "row",

      alignItems:
        "flex-start",

      justifyContent:
        "space-between",

      gap: 10,
    },

    titleArea: {
      flex: 1,

      minWidth: 0,

      flexDirection:
        "row",

      alignItems:
        "flex-start",

      gap: 8,
    },

    checkbox: {
      width: 25,

      minHeight: 25,

      alignItems:
        "center",

      justifyContent:
        "center",

      marginTop: -1,
    },

    typeIconSmall: {
      width: 25,

      height: 25,

      borderRadius: 8,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "#f1efff",
    },

    title: {
      flex: 1,

      minWidth: 0,

      color:
        "#171329",

      fontSize: 15,

      lineHeight: 20,

      fontWeight:
        "900",
    },

    doneTitle: {
      color:
        "#6b7280",

      textDecorationLine:
        "line-through",
    },

    statusBadge: {
      minWidth: 62,

      maxWidth: 82,

      minHeight: 25,

      borderRadius: 13,

      justifyContent:
        "center",

      alignItems:
        "center",

      paddingHorizontal: 9,

      paddingVertical: 4,

      flexShrink: 0,
    },

    statusText: {
      fontSize: 10,

      lineHeight: 13,

      fontWeight:
        "900",
    },

    metaRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      flexWrap:
        "wrap",

      marginTop: 10,

      gap: 8,
    },

    metaItem: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 4,
    },

    metaDivider: {
      width: 3,

      height: 3,

      borderRadius: 2,

      backgroundColor:
        "#d1d5db",
    },

    metaText: {
      color:
        "#7c818d",

      fontSize: 11,

      lineHeight: 15,

      fontWeight:
        "600",
    },

    tagsRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      flexWrap:
        "wrap",

      marginTop: 11,

      gap: 7,
    },

    categoryBadge: {
      maxWidth: 130,

      minHeight: 25,

      borderRadius: 12,

      backgroundColor:
        "#efedff",

      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 5,

      paddingHorizontal: 8,

      paddingVertical: 4,
    },

    categoryText: {
      flexShrink: 1,

      color:
        "#4d3fe6",

      fontSize: 10,

      lineHeight: 13,

      fontWeight:
        "800",
    },

    typeBadge: {
      minHeight: 25,

      borderRadius: 12,

      backgroundColor:
        "#f3f4f6",

      justifyContent:
        "center",

      paddingHorizontal: 8,

      paddingVertical: 4,
    },

    typeText: {
      color:
        "#6b7280",

      fontSize: 10,

      lineHeight: 13,

      fontWeight:
        "800",
    },

    priorityBadge: {
      minHeight: 25,

      borderRadius: 12,

      overflow:
        "hidden",

      paddingHorizontal: 8,

      paddingVertical: 5,

      fontSize: 10,

      lineHeight: 13,

      fontWeight:
        "900",
    },

    chevronArea: {
      width: 34,

      alignItems:
        "center",

      justifyContent:
        "center",

      paddingRight: 7,
    },
  });