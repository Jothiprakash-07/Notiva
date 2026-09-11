import Ionicons from "@expo/vector-icons/Ionicons";
import { useIsFocused } from "@react-navigation/native";
import { router } from "expo-router";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  priorityColors,
  statusColors,
} from "../../constants/itemColors";

import {
  deleteItem,
  resolveItemAction,
  toggleComplete,
} from "../../services/itemStorage";

import { ReminderItem } from "../../types/item";

import {
  formatDate,
  formatTime,
} from "../../utils/dateFormat";

import {
  isActionRequired,
  sortItemsByStatus,
} from "../../utils/itemSorting";

import {
  getItemStatus,
} from "../../utils/itemStatus";

type Props = {
  items: ReminderItem[];
  initialId?: string;
  onClose: () => void;
  onChanged: () => Promise<void>;
};

const actionOptions = [
  {
    label: "Mark as Done",
    description: "Complete this item",
    icon: "checkmark-circle-outline",
  },
  {
    label: "Reschedule",
    description: "Choose a new date and time",
    icon: "calendar-outline",
  },
  {
    label: "Skip",
    description: "Keep it missed or overdue",
    icon: "arrow-forward-outline",
  },
  {
    label: "Delete",
    description: "Remove permanently",
    icon: "trash-outline",
  },
] as const;

// Mount one session per opening.
// This snapshot retains the front card until a saved action animates out.
export default function ActionRequiredStack({
  items,
  initialId,
  onClose,
  onChanged,
}: Props) {
  const [deck, setDeck] = useState(() => {
    const pending = sortItemsByStatus(
      items.filter((item) =>
        isActionRequired(item)
      )
    );

    return [
      ...pending.filter(
        (item) =>
          item.id === initialId
      ),
      ...pending.filter(
        (item) =>
          item.id !== initialId
      ),
    ];
  });

  const [busy, setBusy] =
    useState(false);

  const [menu, setMenu] =
    useState(false);

  const locked =
    useRef(false);

  const retiredIds =
    useRef(new Set<string>());

  // Scoped to this mounted popup.
  // Never written to item storage.
  const dismissedIds =
    useRef(new Set<string>());

  const progress =
    useRef(
      new Animated.Value(0)
    ).current;

  const dragX =
    useRef(
      new Animated.Value(0)
    ).current;

  const focused =
    useIsFocused();

  const {
    width,
    height,
  } = useWindowDimensions();

  const cardWidth = useRef(
    Math.min(
      width - 44,
      480
    )
  );

  const latest = useRef({
    items,
    onClose,
    onChanged,
  });

  latest.current = {
    items,
    onClose,
    onChanged,
  };

  const front =
    deck[0];

  const advance = useCallback(
    (
      id: string,
      direction = 1,
      temporary = false
    ) => {
      if (temporary) {
        dismissedIds.current.add(
          id
        );
      } else {
        retiredIds.current.add(
          id
        );
      }

      locked.current = true;
      setBusy(true);

      Animated.parallel([
        Animated.timing(
          progress,
          {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }
        ),

        Animated.timing(
          dragX,
          {
            toValue:
              direction *
              width,
            duration: 250,
            useNativeDriver: true,
          }
        ),
      ]).start(
        ({ finished }) => {
          if (!finished) {
            return;
          }

          const pending =
            sortItemsByStatus(
              latest.current.items.filter(
                (item) =>
                  !retiredIds.current.has(
                    item.id
                  ) &&
                  !dismissedIds.current.has(
                    item.id
                  ) &&
                  isActionRequired(
                    item
                  )
              )
            );

          setDeck(
            (current) => {
              const ordered =
                current
                  .slice(1)
                  .map(
                    (item) =>
                      pending.find(
                        (
                          next
                        ) =>
                          next.id ===
                          item.id
                      )
                  )
                  .filter(
                    (
                      item
                    ): item is ReminderItem =>
                      Boolean(
                        item
                      )
                  );

              return [
                ...ordered,

                ...pending.filter(
                  (item) =>
                    !ordered.some(
                      (
                        next
                      ) =>
                        next.id ===
                        item.id
                    )
                ),
              ];
            }
          );

          progress.setValue(
            0
          );

          dragX.setValue(
            0
          );

          locked.current =
            false;

          setBusy(false);

          if (
            !pending.length
          ) {
            latest.current.onClose();
          }
        }
      );
    },
    [
      progress,
      dragX,
      width,
    ]
  );

  const snapBack =
    useCallback(() => {
      locked.current = true;
      setBusy(true);

      Animated.spring(
        dragX,
        {
          toValue: 0,
          overshootClamping:
            true,
          speed: 24,
          bounciness: 0,
          useNativeDriver: true,
        }
      ).start(
        ({ finished }) => {
          if (finished) {
            locked.current =
              false;

            setBusy(false);
          }
        }
      );
    }, [dragX]);

  // Returning from the existing reschedule form only advances
  // after refreshed storage confirms success.
  useEffect(() => {
    if (
      focused &&
      front &&
      !locked.current &&
      !items.some(
        (item) =>
          item.id ===
            front.id &&
          isActionRequired(
            item
          )
      )
    ) {
      advance(
        front.id
      );
    }
  }, [
    items,
    focused,
    front,
    advance,
  ]);

  useEffect(
    () => () => {
      progress.stopAnimation();
      dragX.stopAnimation();
    },
    [
      progress,
      dragX,
    ]
  );

  const perform = async (
    action:
      | "done"
      | "skip"
      | "delete",
    direction = 1
  ) => {
    if (
      !front ||
      locked.current
    ) {
      return;
    }

    locked.current = true;
    setBusy(true);
    setMenu(false);

    try {
      if (
        action === "done"
      ) {
        const saved =
          await toggleComplete(
            front.id
          );

        if (
          !saved?.completed
        ) {
          throw new Error(
            "This item could not be marked Done."
          );
        }
      } else if (
        action === "skip"
      ) {
        await resolveItemAction(
          front.id
        );
      } else {
        await deleteItem(
          front.id
        );
      }
    } catch (error) {
      snapBack();

      Alert.alert(
        "Could not update item",
        error instanceof Error
          ? error.message
          : "Please try again. Your card has not been removed."
      );

      return;
    }

    // A list-refresh failure is separate from a successfully persisted action.
    try {
      await latest.current.onChanged();
    } catch {
      Alert.alert(
        "Item saved",
        "Could not refresh the list. Reopen this screen to reload it."
      );
    }

    advance(
      front.id,
      direction
    );
  };

  const swipe =
    useRef({
      front,
      advance,
    });

  swipe.current = {
    front,
    advance,
  };

  const panGesture =
    useMemo(
      () =>
        Gesture.Pan()
          .enabled(
            focused &&
              !menu &&
              !busy
          )
          .activeOffsetX([
            -10,
            10,
          ])
          .failOffsetY([
            -15,
            15,
          ])
          .maxPointers(1)
          .runOnJS(true)
          .onStart(() =>
            dragX.stopAnimation()
          )
          .onUpdate(
            (event) => {
              if (
                !locked.current
              ) {
                dragX.setValue(
                  event.translationX
                );
              }
            }
          )
          .onEnd(
            (
              event,
              success
            ) => {
              if (
                locked.current
              ) {
                return;
              }

              if (
                success &&
                Math.abs(
                  event.translationX
                ) >=
                  cardWidth.current *
                    0.35 &&
                swipe.current
                  .front
              ) {
                swipe.current.advance(
                  swipe.current
                    .front.id,
                  event.translationX <
                    0
                    ? -1
                    : 1,
                  true
                );
              } else {
                snapBack();
              }
            }
          ),
      [
        focused,
        menu,
        busy,
        dragX,
        snapBack,
      ]
    );

  // The scroll view waits for horizontal intent to fail.
  // Vertical movement releases it.
  const bodyScrollGesture =
    useMemo(
      () =>
        Gesture.Native().requireExternalGestureToFail(
          panGesture
        ),
      [panGesture]
    );

  const confirm = (
    action:
      | "done"
      | "delete"
  ) => {
    if (!front) {
      return;
    }

    setMenu(false);

    Alert.alert(
      action === "done"
        ? "Mark as Done?"
        : "Delete this item?",
      front.title,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text:
            action ===
            "done"
              ? "Done"
              : "Delete",
          style:
            action ===
            "delete"
              ? "destructive"
              : "default",
          onPress: () => {
            void perform(
              action
            );
          },
        },
      ]
    );
  };

  const close = () => {
    if (!locked.current) {
      onClose();
    }
  };

  if (!front) {
    return null;
  }

  return (
    <Modal
      visible={focused}
      transparent
      animationType="fade"
      onRequestClose={() =>
        menu
          ? setMenu(false)
          : close()
      }
    >
      <GestureHandlerRootView
        style={styles.root}
      >
        <SafeAreaView
          style={styles.overlay}
        >
          <View
            style={styles.dialog}
            accessibilityViewIsModal
          >
            {/* Header */}
            <View
              style={
                styles.heading
              }
            >
              <View
                style={
                  styles.headingCopy
                }
              >
                <Text
                  style={
                    styles.headingText
                  }
                >
                  Action Required
                </Text>

                <Text
                  style={
                    styles.count
                  }
                >
                  {deck.length}{" "}
                  pending
                  {deck.length >
                  3
                    ? ` · +${
                        deck.length -
                        3
                      } more`
                    : ""}
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close Action Required"
                disabled={busy}
                onPress={close}
                hitSlop={12}
                style={({ pressed }) => [
                  styles.close,
                  pressed &&
                    styles.closePressed,
                ]}
              >
                <Ionicons
                  name="close"
                  size={23}
                  color="#ffffff"
                />
              </Pressable>
            </View>

            {/* Card stack */}
            <View
              style={styles.stack}
              onLayout={(
                event
              ) => {
                cardWidth.current =
                  event.nativeEvent.layout.width;
              }}
              pointerEvents={
                menu
                  ? "none"
                  : "auto"
              }
              accessibilityElementsHidden={
                menu
              }
              importantForAccessibility={
                menu
                  ? "no-hide-descendants"
                  : "auto"
              }
            >
              {deck
                .slice(0, 3)
                .map(
                  (
                    item,
                    index
                  ) => {
                    const isFront =
                      index === 0;

                    const date =
                      new Date(
                        item.startAt
                      );

                    const card = (
                      <Animated.View
                        collapsable={
                          false
                        }
                        pointerEvents={
                          isFront &&
                          !busy
                            ? "auto"
                            : "none"
                        }
                        accessibilityElementsHidden={
                          !isFront
                        }
                        importantForAccessibility={
                          isFront
                            ? "auto"
                            : "no-hide-descendants"
                        }
                        style={[
                          styles.card,

                          !isFront &&
                            styles.backCard,

                          {
                            zIndex:
                              3 -
                              index,

                            opacity:
                              progress.interpolate(
                                {
                                  inputRange:
                                    [
                                      0,
                                      1,
                                    ],

                                  outputRange:
                                    isFront
                                      ? [
                                          1,
                                          0,
                                        ]
                                      : [
                                          1 -
                                            index *
                                              0.18,

                                          1 -
                                            (index -
                                              1) *
                                              0.18,
                                        ],
                                }
                              ),

                            transform:
                              [
                                {
                                  translateX:
                                    isFront
                                      ? dragX
                                      : 0,
                                },

                                {
                                  translateY:
                                    progress.interpolate(
                                      {
                                        inputRange:
                                          [
                                            0,
                                            1,
                                          ],

                                        outputRange:
                                          [
                                            -index *
                                              15,

                                            -Math.max(
                                              0,
                                              index -
                                                1
                                            ) *
                                              15,
                                          ],
                                      }
                                    ),
                                },

                                {
                                  scale:
                                    progress.interpolate(
                                      {
                                        inputRange:
                                          [
                                            0,
                                            1,
                                          ],

                                        outputRange:
                                          [
                                            1 -
                                              index *
                                                0.045,

                                            1 -
                                              Math.max(
                                                0,
                                                index -
                                                  1
                                              ) *
                                                0.045,
                                          ],
                                      }
                                    ),
                                },
                              ],
                          },
                        ]}
                      >
                        {isFront ? (
                          <>
                            {/* Entire content body is swipeable */}
                            <GestureDetector
                              gesture={
                                panGesture
                              }
                            >
                              <View
                                collapsable={
                                  false
                                }
                              >
                                <GestureDetector
                                  gesture={
                                    bodyScrollGesture
                                  }
                                >
                                  <ScrollView
                                    style={{
                                      maxHeight:
                                        Math.max(
                                          120,
                                          height -
                                            350
                                        ),
                                    }}
                                    contentContainerStyle={
                                      styles.content
                                    }
                                    showsVerticalScrollIndicator={
                                      false
                                    }
                                  >
                                    <Text
                                      style={[
                                        styles.badge,

                                        statusColors[
                                          getItemStatus(
                                            item
                                          )
                                        ],
                                      ]}
                                    >
                                      {getItemStatus(
                                        item
                                      )}
                                    </Text>

                                    <Text
                                      style={
                                        styles.title
                                      }
                                    >
                                      {
                                        item.title
                                      }
                                    </Text>

                                    <View
                                      style={
                                        styles.dateTimeRow
                                      }
                                    >
                                      <View
                                        style={
                                          styles.dateTimeItem
                                        }
                                      >
                                        <Ionicons
                                          name="calendar-outline"
                                          size={
                                            17
                                          }
                                          color="#4d3fe6"
                                        />

                                        <Text
                                          style={
                                            styles.date
                                          }
                                        >
                                          {formatDate(
                                            date
                                          )}
                                        </Text>
                                      </View>

                                      <View
                                        style={
                                          styles.dateTimeItem
                                        }
                                      >
                                        <Ionicons
                                          name="time-outline"
                                          size={
                                            17
                                          }
                                          color="#4d3fe6"
                                        />

                                        <Text
                                          style={
                                            styles.time
                                          }
                                        >
                                          {item.allDay
                                            ? "All day"
                                            : formatTime(
                                                date
                                              )}
                                        </Text>
                                      </View>
                                    </View>

                                    <Text
                                      style={
                                        styles.description
                                      }
                                    >
                                      {item.description ||
                                        "No description"}
                                    </Text>

                                    <View
                                      style={
                                        styles.tags
                                      }
                                    >
                                      {item.category ? (
                                        <Text
                                          style={
                                            styles.category
                                          }
                                        >
                                          {
                                            item.category
                                          }
                                        </Text>
                                      ) : null}

                                      {item.priority ? (
                                        <Text
                                          style={[
                                            styles.badge,

                                            priorityColors[
                                              item
                                                .priority
                                            ],
                                          ]}
                                        >
                                          {
                                            item.priority
                                          }
                                        </Text>
                                      ) : null}
                                    </View>
                                  </ScrollView>
                                </GestureDetector>
                              </View>
                            </GestureDetector>

                            {/* Action button stays outside swipe body */}
                            <View
                              style={
                                styles.buttons
                              }
                            >
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel="Open item actions"
                                accessibilityState={{
                                  busy,
                                  disabled:
                                    busy,
                                }}
                                disabled={
                                  busy
                                }
                                style={({
                                  pressed,
                                }) => [
                                  styles.button,
                                  styles.primary,

                                  pressed &&
                                    !busy &&
                                    styles.primaryPressed,
                                ]}
                                onPress={() =>
                                  setMenu(
                                    true
                                  )
                                }
                              >
                                <Ionicons
                                  name="ellipsis-horizontal-circle-outline"
                                  size={20}
                                  color="#ffffff"
                                />

                                <Text
                                  style={
                                    styles.primaryText
                                  }
                                >
                                  Action
                                </Text>
                              </Pressable>
                            </View>

                            <Text
                              style={
                                styles.swipeHint
                              }
                            >
                              Swipe left or
                              right to dismiss
                              for now
                            </Text>
                          </>
                        ) : (
                          <Text
                            numberOfLines={
                              1
                            }
                            style={
                              styles.preview
                            }
                          >
                            {
                              item.title
                            }
                          </Text>
                        )}
                      </Animated.View>
                    );

                    return (
                      <Fragment
                        key={
                          item.id
                        }
                      >
                        {card}
                      </Fragment>
                    );
                  }
                )}
            </View>

            {/* Action menu */}
            {menu ? (
              <View
                style={[
                  styles.menu,
                  {
                    maxHeight:
                      Math.max(
                        180,
                        height -
                          160
                      ),
                  },
                ]}
                accessibilityViewIsModal
              >
                <View
                  style={
                    styles.menuHeader
                  }
                >
                  <Text
                    style={
                      styles.menuTitle
                    }
                  >
                    Choose an action
                  </Text>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close actions"
                    hitSlop={10}
                    style={
                      styles.menuClose
                    }
                    onPress={() =>
                      setMenu(
                        false
                      )
                    }
                  >
                    <Ionicons
                      name="close"
                      size={21}
                      color="#6b7280"
                    />
                  </Pressable>
                </View>

                <ScrollView
                  contentContainerStyle={
                    styles.menuCards
                  }
                  showsVerticalScrollIndicator={
                    false
                  }
                >
                  {actionOptions.map(
                    ({
                      label,
                      description,
                      icon,
                    }) => (
                      <Pressable
                        key={
                          label
                        }
                        accessibilityRole="button"
                        accessibilityLabel={
                          label
                        }
                        accessibilityHint={
                          description
                        }
                        style={({
                          pressed,
                        }) => [
                          styles.menuOption,

                          label ===
                            "Delete" &&
                            styles.dangerCard,

                          pressed &&
                            styles.menuOptionPressed,
                        ]}
                        onPress={() => {
                          setMenu(
                            false
                          );

                          if (
                            label ===
                            "Mark as Done"
                          ) {
                            confirm(
                              "done"
                            );
                          } else if (
                            label ===
                            "Reschedule"
                          ) {
                            router.push(
                              {
                                pathname:
                                  "/screens/create/[type]",

                                params:
                                  {
                                    type: front.type,
                                    id: front.id,
                                    mode: "reschedule",
                                    returnToStack:
                                      "1",
                                  },
                              }
                            );
                          } else if (
                            label ===
                            "Skip"
                          ) {
                            void perform(
                              "skip"
                            );
                          } else if (
                            label ===
                            "Delete"
                          ) {
                            confirm(
                              "delete"
                            );
                          }
                        }}
                      >
                        <View
                          style={[
                            styles.menuIcon,

                            label ===
                              "Delete" &&
                              styles.dangerIcon,
                          ]}
                        >
                          <Ionicons
                            name={
                              icon
                            }
                            size={
                              25
                            }
                            color={
                              label ===
                              "Delete"
                                ? "#b91c1c"
                                : "#4d3fe6"
                            }
                          />
                        </View>

                        <View
                          style={
                            styles.menuCopy
                          }
                        >
                          <Text
                            style={[
                              styles.secondaryText,

                              label ===
                                "Delete" &&
                                styles.deleteText,
                            ]}
                          >
                            {
                              label
                            }
                          </Text>

                          <Text
                            style={
                              styles.menuDescription
                            }
                          >
                            {
                              description
                            }
                          </Text>
                        </View>

                        <Ionicons
                          name="chevron-forward"
                          size={19}
                          color={
                            label ===
                            "Delete"
                              ? "#b91c1c"
                              : "#9ca3af"
                          }
                        />
                      </Pressable>
                    )
                  )}
                </ScrollView>

                <Pressable
                  accessibilityRole="button"
                  style={({
                    pressed,
                  }) => [
                    styles.cancel,

                    pressed &&
                      styles.cancelPressed,
                  ]}
                  onPress={() =>
                    setMenu(
                      false
                    )
                  }
                >
                  <Text
                    style={
                      styles.secondaryText
                    }
                  >
                    Cancel
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles =
  StyleSheet.create({
    root: {
      flex: 1,
    },

    overlay: {
      flex: 1,
      backgroundColor:
        "rgba(20,16,48,0.64)",
      justifyContent:
        "center",
      paddingHorizontal: 22,
      paddingVertical: 20,
    },

    dialog: {
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
    },

    /*
     * Header:
     * Title/count on left and close button on right.
     * Reduced bottom gap from 48 to 20.
     */
    heading: {
      flexDirection: "row",
      alignItems:
        "flex-start",
      justifyContent:
        "space-between",
      marginBottom: 20,
    },

    headingCopy: {
      flex: 1,
      paddingRight: 16,
    },

    headingText: {
      color: "#ffffff",
      fontSize: 23,
      fontWeight: "900",
      lineHeight: 28,
    },

    count: {
      color: "#e0dcff",
      marginTop: 4,
      fontSize: 13,
      fontWeight: "600",
    },

    close: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "rgba(255,255,255,0.12)",
      marginTop: -2,
    },

    closePressed: {
      opacity: 0.72,
    },

    stack: {
      position: "relative",
    },

    card: {
      width: "100%",
      backgroundColor:
        "#ffffff",
      borderRadius: 20,

      shadowColor:
        "#15102e",
      shadowOpacity: 0.23,
      shadowRadius: 16,
      shadowOffset: {
        width: 0,
        height: 7,
      },

      elevation: 8,
      overflow: "hidden",
    },

    backCard: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor:
        "#e6e0ff",
      elevation: 2,
    },

    preview: {
      paddingHorizontal: 22,
      paddingTop: 12,
      fontSize: 10,
      color: "#6553ac",
      fontWeight: "700",
    },

    content: {
      paddingHorizontal: 22,
      paddingTop: 22,
      paddingBottom: 20,
    },

    badge: {
      alignSelf:
        "flex-start",
      paddingHorizontal: 9,
      paddingVertical: 4,
      borderRadius: 10,
      overflow: "hidden",
      fontSize: 12,
      fontWeight: "800",
    },

    title: {
      fontSize: 24,
      lineHeight: 30,
      fontWeight: "900",
      color: "#19132e",
      marginTop: 16,
      marginBottom: 14,
    },

    dateTimeRow: {
      flexDirection: "row",
      alignItems: "center",
      flexWrap: "wrap",
      columnGap: 18,
      rowGap: 8,
    },

    dateTimeItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },

    date: {
      fontSize: 15,
      fontWeight: "700",
      color: "#4d3fe6",
    },

    time: {
      fontSize: 15,
      fontWeight: "600",
      color: "#4d3fe6",
    },

    description: {
      color: "#6b7280",
      fontSize: 14,
      lineHeight: 22,
      marginVertical: 18,
    },

    tags: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },

    category: {
      color: "#4d3fe6",
      backgroundColor:
        "#ede9fe",
      borderRadius: 10,
      paddingHorizontal: 9,
      paddingVertical: 4,
      overflow: "hidden",
      fontSize: 12,
      fontWeight: "700",
    },

    /*
     * Action button is outside the swipe body.
     * This helps avoid swipe/press conflicts.
     */
    buttons: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 10,
      borderTopWidth: 1,
      borderTopColor:
        "#f0edf8",
    },

    button: {
      minHeight: 48,
      flexDirection: "row",
      gap: 8,
      justifyContent:
        "center",
      alignItems: "center",
      borderRadius: 12,
    },

    primary: {
      backgroundColor:
        "#4d3fe6",
    },

    primaryPressed: {
      opacity: 0.85,
    },

    primaryText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 15,
    },

    secondaryText: {
      color: "#4d3fe6",
      fontWeight: "800",
      fontSize: 15,
    },

    swipeHint: {
      color: "#8b8d98",
      fontSize: 11,
      lineHeight: 16,
      textAlign: "center",
      paddingHorizontal: 20,
      paddingTop: 2,
      paddingBottom: 14,
    },

    /*
     * Action menu overlays the card.
     */
    menu: {
      ...StyleSheet.absoluteFillObject,

      top: undefined,

      backgroundColor:
        "#ffffff",

      borderRadius: 20,
      padding: 18,

      zIndex: 10,
      elevation: 12,

      shadowColor:
        "#15102e",
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: {
        width: 0,
        height: 7,
      },
    },

    menuHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      marginBottom: 10,
    },

    menuTitle: {
      color: "#19132e",
      fontWeight: "900",
      fontSize: 18,
    },

    menuClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#f3f4f6",
    },

    menuCards: {
      gap: 10,
      paddingVertical: 4,
    },

    menuOption: {
      minHeight: 74,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,

      padding: 12,

      borderRadius: 14,
      borderWidth: 1,
      borderColor:
        "#ded8ff",

      backgroundColor:
        "#faf8ff",
    },

    menuOptionPressed: {
      opacity: 0.78,
    },

    menuIcon: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#ede9fe",
    },

    menuCopy: {
      flex: 1,
    },

    menuDescription: {
      color: "#6b7280",
      fontSize: 12,
      lineHeight: 17,
      marginTop: 4,
    },

    dangerCard: {
      borderColor:
        "#fecaca",
      backgroundColor:
        "#fff7f7",
    },

    dangerIcon: {
      backgroundColor:
        "#fee2e2",
    },

    deleteText: {
      color: "#b91c1c",
    },

    cancel: {
      minHeight: 48,
      alignItems: "center",
      justifyContent:
        "center",
      marginTop: 8,
      borderRadius: 12,
      backgroundColor:
        "#f8f7ff",
    },

    cancelPressed: {
      opacity: 0.72,
    },
  });