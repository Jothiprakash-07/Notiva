import CompletionNoteModal from "../../../components/common/CompletionNoteModal";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import ActionRequiredStack from "../../../components/home/ActionRequiredStack";
import CreateTypeSheet from "../../../components/home/CreateTypeSheet";
import ReminderCard from "../../../components/home/ReminderCard";
import StatsCard from "../../../components/home/StatsCard";

import { useAuth } from "../../../contexts/AuthContext";

import {
  getItems,
  toggleComplete,
} from "../../../services/itemStorage";

import { ReminderItem } from "../../../types/item";

import {
  formatDate,
  formatTime,
} from "../../../utils/dateFormat";

import {
  shouldAutoOpenActionRequired,
} from "../../../utils/actionRequiredSession";

import {
  getItemStatus,
  isCountedAsDone,
  isCountedAsOverdue,
  withCalculatedStatus,
} from "../../../utils/itemStatus";

import {
  isActionRequired,
  sortItemsByStatus,
} from "../../../utils/itemSorting";

// Status card icons
const totalIcon = require(
  "../../../assets/icon/status/solar.png"
);

const doneIcon = require(
  "../../../assets/icon/status/hugeicons.png"
);

const overdueIcon = require(
  "../../../assets/icon/status/fluent_cursor.png"
);

function getGreeting(date: Date) {
  const hour =
    date.getHours();

  if (
    hour >= 5 &&
    hour < 12
  ) {
    return "Good morning";
  }

  if (
    hour >= 12 &&
    hour < 17
  ) {
    return "Good afternoon";
  }

  if (
    hour >= 17 &&
    hour < 22
  ) {
    return "Good evening";
  }

  return "Good night";
}

function getInitials(
  fullName: string
) {
  const parts =
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean);

  if (
    parts.length === 0
  ) {
    return "U";
  }

  if (
    parts.length === 1
  ) {
    return parts[0]
      .slice(0, 2)
      .toUpperCase();
  }

  return `${parts[0][0]}${
    parts[
      parts.length - 1
    ][0]
  }`.toUpperCase();
}

type DateFilter =
  | "Today"
  | "Tomorrow"
  | "This Week"
  | "This Month"
  | "Next Month";

const dateFilters: DateFilter[] =
  [
    "Today",
    "Tomorrow",
    "This Week",
    "This Month",
    "Next Month",
  ];

function displayItem(
  item: ReminderItem
) {
  const start =
    new Date(
      item.startAt
    );

  return {
    time:
      item.allDay
        ? "All day"
        : formatTime(
            start
          ),

    date:
      formatDate(
        start,
        "short"
      ),
  };
}

function matchesDateFilter(
  startAt: string,
  filter: DateFilter,
  now: Date
): boolean {
  const timestamp =
    new Date(
      startAt
    ).getTime();

  if (
    !Number.isFinite(
      timestamp
    )
  ) {
    return false;
  }

  const todayStart =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0,
      0
    );

  let start =
    new Date(
      todayStart
    );

  let end =
    new Date(
      todayStart
    );

  if (
    filter === "Today"
  ) {
    end.setDate(
      end.getDate() +
        1
    );
  }

  if (
    filter ===
    "Tomorrow"
  ) {
    start.setDate(
      start.getDate() +
        1
    );

    end =
      new Date(
        start
      );

    end.setDate(
      end.getDate() +
        1
    );
  }

  if (
    filter ===
    "This Week"
  ) {
    const day =
      start.getDay();

    const daysUntilSunday =
      day === 0
        ? 1
        : 8 - day;

    end.setDate(
      end.getDate() +
        daysUntilSunday
    );
  }

  if (
    filter ===
    "This Month"
  ) {
    end =
      new Date(
        now.getFullYear(),
        now.getMonth() +
          1,
        1,
        0,
        0,
        0,
        0
      );
  }

  if (
    filter ===
    "Next Month"
  ) {
    start =
      new Date(
        now.getFullYear(),
        now.getMonth() +
          1,
        1,
        0,
        0,
        0,
        0
      );

    end =
      new Date(
        now.getFullYear(),
        now.getMonth() +
          2,
        1,
        0,
        0,
        0,
        0
      );
  }

  return (
    timestamp >=
      start.getTime() &&
    timestamp <
      end.getTime()
  );
}

export default function HomeScreen() {
  const { session } =
    useAuth();

  /*
   * notificationItemId comes from
   * app/_layout.tsx when user taps
   * a notification.
   */
  const params =
    useLocalSearchParams<{
      notificationResponseId?: string | string[];
      notificationItemId?:
        | string
        | string[];
    }>();

  const notificationItemId =
    Array.isArray(
      params.notificationItemId
    )
      ? params
          .notificationItemId[0]
      : params.notificationItemId;

  const [
    currentDate,
    setCurrentDate,
  ] = useState(
    () => new Date()
  );

  const [
    searchText,
    setSearchText,
  ] = useState("");

  const [
    dateFilter,
    setDateFilter,
  ] =
    useState<DateFilter>(
      "Today"
    );

  const [
    showActions,
    setShowActions,
  ] = useState(false);

  /*
   * When notification opens
   * Action Required, this ID
   * becomes the first card.
   */
  const [
    actionInitialId,
    setActionInitialId,
  ] = useState<
    string | undefined
  >(undefined);

  const [
    items,
    setItems,
  ] = useState<
    ReminderItem[]
  >([]);

  const [
    showCreate,
    setShowCreate,
  ] = useState(false);

  /*
   * Prevent duplicate processing
   * before route param is cleared.
   */
  const handledNotification = useRef<string | undefined>(undefined);
  const suppressAutoOpen = useRef(false);
  const [notificationOpening, setNotificationOpening] = useState(0);
  const notificationResponseId = Array.isArray(params.notificationResponseId)
    ? params.notificationResponseId[0] : params.notificationResponseId;

  useEffect(() => {
    const timer =
      setInterval(
        () => {
          setCurrentDate(
            new Date()
          );
        },
        30_000
      );

    return () => {
      clearInterval(
        timer
      );
    };
  }, []);

  const fullName =
    session?.user.fullName.trim() ||
    "User";

  const avatarInitials =
    getInitials(
      fullName
    );

  const loadItems =
    useCallback(
      async () => {
        const stored =
          await getItems();

        setItems(
          stored.map(
            (
              item
            ) =>
              withCalculatedStatus(
                item
              )
          )
        );
      },
      []
    );

  /*
   * Handle notification tap.
   *
   * app/_layout.tsx has already
   * cancelled remaining repeated
   * scheduled notifications.
   *
   * Here we decide what screen
   * should be shown.
   */
  useEffect(() => {
    if (!notificationItemId) return;
    const key = notificationResponseId || notificationItemId;
    if (handledNotification.current === key) return;
    let active = true;
    suppressAutoOpen.current = true;
    const handle = async () => {
      try {
        const stored = await getItems();
        if (!active) return;
        handledNotification.current = key;
        const calculated = stored.map(item => withCalculatedStatus(item));
        setItems(calculated);
        const tappedItem = calculated.find(item => item.id === notificationItemId);
        // Clear Home's params before pushing Details. Cleanup must not clear a newer tap.
        router.setParams({ notificationItemId: undefined, notificationResponseId: undefined });
        if (!tappedItem) return;
        if (isActionRequired(tappedItem)) {
          setActionInitialId(tappedItem.id);
          setNotificationOpening(value => value + 1);
          setShowActions(true);
        } else {
          setShowActions(false);
          router.push({ pathname: "/screens/details/[id]", params: { id: tappedItem.id } });
        }
      } catch (error) {
        if (active) {
          router.setParams({ notificationItemId: undefined, notificationResponseId: undefined });
          console.warn("Could not handle notification item:", error);
          Alert.alert("Could not open item", "Please reopen Home to try again.");
        }
      }
    };
    void handle();
    return () => { active = false; };
  }, [notificationItemId, notificationResponseId]);

  useFocusEffect(
    useCallback(() => {
      let active =
        true;

      const refresh =
        async () => {
          try {
            const stored =
              await getItems();

            if (
              active
            ) {
              const calculated =
                stored.map(
                  (
                    item
                  ) =>
                    withCalculatedStatus(
                      item
                    )
                );

              setItems(
                calculated
              );

              /*
               * Don't auto-open generic
               * stack when a specific
               * notification item is
               * currently being handled.
               */
              if (
                !notificationItemId &&
                !suppressAutoOpen.current &&
                shouldAutoOpenActionRequired(
                  stored
                )
              ) {
                setActionInitialId(
                  undefined
                );

                setShowActions(
                  true
                );
              }
            }
          } catch {
            if (
              active
            ) {
              Alert.alert(
                "Could not load reminders",
                "Please reopen Home to try again."
              );
            }
          }
        };

      void refresh();

      let wasBackgrounded =
        AppState.currentState ===
        "background";

      const subscription =
        AppState.addEventListener(
          "change",
          (
            next
          ) => {
            if (
              next ===
              "background"
            ) {
              wasBackgrounded =
                true;
            }

            if (
              next ===
                "active" &&
              wasBackgrounded
            ) {
              wasBackgrounded =
                false;

              void refresh();
            }
          }
        );

      /*
       * Status refresh.
       *
       * Example:
       * Pending → Missed
       * while app remains open.
       */
      const timer =
        setInterval(
          () => {
            if (
              active
            ) {
              setItems(
                (
                  current
                ) =>
                  current.map(
                    (
                      item
                    ) =>
                      withCalculatedStatus(
                        item
                      )
                  )
              );
            }
          },
          1000
        );

      return () => {
        active =
          false;

        subscription.remove();

        clearInterval(
          timer
        );
      };
    }, [
      notificationItemId,
    ])
  );

  const filteredReminders =
    useMemo(() => {
      const search =
        searchText
          .trim()
          .toLowerCase();

      const now =
        new Date();

      return sortItemsByStatus(
        items.filter(
          (
            reminder
          ) => {
            const dateMatches =
              matchesDateFilter(
                reminder.startAt,
                dateFilter,
                now
              );

            if (
              !dateMatches
            ) {
              return false;
            }

            if (!search) {
              return true;
            }

            return (
              reminder.title
                .toLowerCase()
                .includes(
                  search
                ) ||
              reminder.category
                ?.toLowerCase()
                .includes(
                  search
                ) ||
              reminder.type
                .toLowerCase()
                .includes(
                  search
                ) ||
              getItemStatus(
                reminder,
                now
              )
                .toLowerCase()
                .includes(
                  search
                )
            );
          }
        ),
        now
      );
    }, [
      items,
      searchText,
      dateFilter,
    ]);

  const actionRequiredItems =
    useMemo(
      () =>
        sortItemsByStatus(
          items.filter(
            (
              item
            ) =>
              isActionRequired(
                item
              )
          )
        ),
      [
        items,
      ]
    );

  const totalCount =
    items.length;

  const doneCount =
    items.filter(
      isCountedAsDone
    ).length;

  const overdueCount =
    items.filter(
      isCountedAsOverdue
    ).length;

  const [completionItemId, setCompletionItemId] = useState<string | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);

  const handleToggle = (id: string) => {
    const selected = items.find(item => item.id === id);
    if (selected && !selected.completed && selected.status !== "Done") setCompletionItemId(id);
  };

  const confirmCompletion = async (note?: string) => {
    if (!completionItemId || completionSaving) return;
    setCompletionSaving(true);
    try {
      const updated = await toggleComplete(completionItemId, note);
      if (!updated?.completed) throw new Error("Item could not be completed.");
      const stored = await getItems();
      setItems(stored.map(item => withCalculatedStatus(item)));
      setCompletionItemId(null);
    } catch (error) {
      Alert.alert("Could not complete item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setCompletionSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={
        styles.safeArea
      }
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      <StatusBar
        barStyle="light-content"
        backgroundColor="#4d3fe6"
      />

      <View
        style={
          styles.container
        }
      >
        {/* Header */}
        <View
          style={
            styles.header
          }
        >
          <View
            style={
              styles.headerCopy
            }
          >
            <Text
              allowFontScaling={
                false
              }
              style={
                styles.greeting
              }
            >
              {getGreeting(
                currentDate
              )}
              ,
            </Text>

            <Text
              allowFontScaling={
                false
              }
              numberOfLines={
                1
              }
              style={
                styles.userName
              }
            >
              {fullName}
            </Text>

            <View
              style={
                styles.dateRow
              }
            >
              <Ionicons
                name="calendar-outline"
                size={13}
                color="#ddd9ff"
              />

              <Text
                allowFontScaling={
                  false
                }
                numberOfLines={
                  1
                }
                style={
                  styles.dateText
                }
              >
                {`${currentDate.toLocaleDateString(
                  "en-GB",
                  {
                    weekday:
                      "long",
                  }
                )}, ${formatDate(
                  currentDate
                )}`}
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open profile"
            hitSlop={8}
            style={({
              pressed,
            }) => [
              styles.avatar,

              pressed &&
                styles.avatarPressed,
            ]}
            onPress={() =>
              router.push(
                "/(tabs)/profile"
              )
            }
          >
            <Text
              allowFontScaling={
                false
              }
              style={
                styles.avatarText
              }
            >
              {avatarInitials}
            </Text>
          </Pressable>
        </View>

        {/* Main white area */}
        <View
          style={
            styles.contentArea
          }
        >
          {/* Stats */}
          <View
            style={
              styles.statsRow
            }
          >
            <StatsCard
              icon={
                totalIcon
              }
              count={
                totalCount
              }
              label="Total"
              variant="total"
              onPress={() =>
                router.push({
                  pathname:
                    "/(tabs)/reminders",

                  params: {
                    filter:
                      "all",
                  },
                })
              }
            />

            <StatsCard
              icon={
                doneIcon
              }
              count={
                doneCount
              }
              label="Done"
              variant="done"
              onPress={() =>
                router.push({
                  pathname:
                    "/(tabs)/reminders",

                  params: {
                    filter:
                      "done",
                  },
                })
              }
            />

            <StatsCard
              icon={
                overdueIcon
              }
              count={
                overdueCount
              }
              label="Overdue"
              variant="overdue"
              onPress={() =>
                router.push({
                  pathname:
                    "/(tabs)/reminders",

                  params: {
                    filter:
                      "overdue",
                  },
                })
              }
            />
          </View>

          {/* Search */}
          <View
            style={
              styles.searchBox
            }
          >
            <View
              style={
                styles.searchIconWrap
              }
            >
              <Ionicons
                name="search-outline"
                size={18}
                color="#4d3fe6"
              />
            </View>

            <TextInput
              style={
                styles.searchInput
              }
              placeholder="Search reminders"
              placeholderTextColor="#9ca3af"
              value={
                searchText
              }
              onChangeText={
                setSearchText
              }
              returnKeyType="search"
            />

            {searchText.length >
            0 ? (
              <Pressable
                hitSlop={
                  8
                }
                style={
                  styles.clearButton
                }
                onPress={() =>
                  setSearchText(
                    ""
                  )
                }
              >
                <Ionicons
                  name="close-circle"
                  size={19}
                  color="#9ca3af"
                />
              </Pressable>
            ) : null}
          </View>

          {/* Section title */}
          <View
            style={
              styles.sectionHeader
            }
          >
            <View>
              <Text
                allowFontScaling={
                  false
                }
                style={
                  styles.sectionTitle
                }
              >
                {dateFilter}
              </Text>

              <Text
                allowFontScaling={
                  false
                }
                style={
                  styles.sectionSubtitle
                }
              >
                Your scheduled items
              </Text>
            </View>

            <View
              style={
                styles.countBadge
              }
            >
              <Text
                allowFontScaling={
                  false
                }
                style={
                  styles.countBadgeText
                }
              >
                {
                  filteredReminders.length
                }
              </Text>
            </View>
          </View>

          {/* Date filters */}
          <View
            style={
              styles.filterArea
            }
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={
                false
              }
              style={
                styles.filterScroll
              }
              contentContainerStyle={
                styles.filterRow
              }
              keyboardShouldPersistTaps="handled"
            >
              {dateFilters.map(
                (
                  filter
                ) => {
                  const selected =
                    dateFilter ===
                    filter;

                  return (
                    <Pressable
                      key={
                        filter
                      }
                      style={({
                        pressed,
                      }) => [
                        styles.filterChip,

                        selected &&
                          styles.selectedFilterChip,

                        pressed &&
                          styles.filterPressed,
                      ]}
                      onPress={() =>
                        setDateFilter(
                          filter
                        )
                      }
                    >
                      <Text
                        allowFontScaling={
                          false
                        }
                        style={[
                          styles.filterText,

                          selected &&
                            styles.selectedFilterText,
                        ]}
                      >
                        {filter}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </ScrollView>
          </View>

          {/* Scrollable content */}
          <View
            style={
              styles.listArea
            }
          >
            <ScrollView
              style={
                styles.reminderScroll
              }
              contentContainerStyle={
                styles.reminderScrollContent
              }
              showsVerticalScrollIndicator={
                false
              }
              keyboardShouldPersistTaps="handled"
            >
              {/* Action Required */}
              {actionRequiredItems.length >
              0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${actionRequiredItems.length} Action Required items`}
                  style={({
                    pressed,
                  }) => [
                    styles.actionSection,

                    pressed &&
                      styles.actionSectionPressed,
                  ]}
                  onPress={() => {
                    setActionInitialId(
                      undefined
                    );

                    setShowActions(
                      true
                    );
                  }}
                >
                  <View
                    style={
                      styles.actionIcon
                    }
                  >
                    <Ionicons
                      name="warning-outline"
                      size={21}
                      color="#4d3fe6"
                    />
                  </View>

                  <View
                    style={
                      styles.actionCopy
                    }
                  >
                    <Text
                      style={
                        styles.actionTitle
                      }
                    >
                      Action Required
                    </Text>

                    <Text
                      style={
                        styles.actionHint
                      }
                    >
                      {
                        actionRequiredItems.length
                      }{" "}
                      {actionRequiredItems.length ===
                      1
                        ? "item needs"
                        : "items need"}{" "}
                      your attention
                    </Text>
                  </View>

                  <View
                    style={
                      styles.actionArrow
                    }
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={18}
                      color="#4d3fe6"
                    />
                  </View>
                </Pressable>
              ) : null}

              {filteredReminders.length >
              0 ? (
                filteredReminders.map(
                  (
                    reminder
                  ) => {
                    const shown =
                      displayItem(
                        reminder
                      );

                    return (
                      <View
                        key={
                          reminder.id
                        }
                        style={
                          styles.cardWrap
                        }
                      >
                        <ReminderCard
                          id={
                            reminder.id
                          }
                          title={
                            reminder.title
                          }
                          time={
                            shown.time
                          }
                          date={
                            shown.date
                          }
                          category={
                            reminder.category
                          }
                          priority={
                            reminder.priority
                          }
                          status={getItemStatus(
                            reminder
                          )}
                          type={
                            reminder.type
                          }
                          onPress={() =>
                            router.push(
                              `/screens/details/${reminder.id}` as any
                            )
                          }
                          onToggle={() =>
                            handleToggle(
                              reminder.id
                            )
                          }
                        />
                      </View>
                    );
                  }
                )
              ) : (
                <View
                  style={
                    styles.emptyBox
                  }
                >
                  <View
                    style={
                      styles.emptyIcon
                    }
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={28}
                      color="#4d3fe6"
                    />
                  </View>

                  <Text
                    allowFontScaling={
                      false
                    }
                    style={
                      styles.emptyTitle
                    }
                  >
                    No items for{" "}
                    {dateFilter}
                  </Text>

                  <Text
                    allowFontScaling={
                      false
                    }
                    style={
                      styles.emptyText
                    }
                  >
                    Tap + to create a reminder, task, event or birthday.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>

        {/* FAB */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create new item"
          style={({
            pressed,
          }) => [
            styles.floatingButton,

            pressed &&
              styles.floatingButtonPressed,
          ]}
          onPress={() =>
            setShowCreate(
              true
            )
          }
        >
          <Ionicons
            name="add"
            size={30}
            color="#ffffff"
          />
        </Pressable>
      </View>

      {/* Action Required Stack */}
      {showActions ? (
        <ActionRequiredStack
          key={notificationOpening}
          items={items}
          initialId={
            actionInitialId
          }
          onClose={() => {
            setShowActions(
              false
            );

            setActionInitialId(
              undefined
            );
          }}
          onChanged={
            loadItems
          }
        />
      ) : null}

      {/* Create sheet */}
      <CreateTypeSheet
        visible={
          showCreate
        }
        onClose={() =>
          setShowCreate(
            false
          )
        }
        onSelect={(
          type
        ) => {
          setShowCreate(
            false
          );

          router.push(
            `/screens/create/${type}` as any
          );
        }}
      />
      <CompletionNoteModal
        visible={completionItemId !== null}
        itemTitle={items.find(item => item.id === completionItemId)?.title}
        saving={completionSaving}
        onClose={() => { if (!completionSaving) setCompletionItemId(null); }}
        onConfirm={confirmCompletion}
      />
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safeArea: {
      flex: 1,

      backgroundColor:
        "#4d3fe6",
    },

    container: {
      flex: 1,

      backgroundColor:
        "#f7f7fc",
    },

    /* Header */

    header: {
      minHeight: 116,

      backgroundColor:
        "#4d3fe6",

      paddingHorizontal: 18,
      paddingTop: 15,
      paddingBottom: 20,

      flexDirection: "row",

      alignItems: "center",

      justifyContent:
        "space-between",

      gap: 14,
    },

    headerCopy: {
      flex: 1,
      minWidth: 0,
    },

    greeting: {
      color:
        "#c8c3ff",

      fontSize: 12,
      lineHeight: 17,

      fontWeight: "700",

      marginBottom: 3,
    },

    userName: {
      color:
        "#ffffff",

      fontSize: 20,
      lineHeight: 26,

      fontWeight: "900",

      marginBottom: 5,
    },

    dateRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 5,
    },

    dateText: {
      flexShrink: 1,

      color:
        "#e3e0ff",

      fontSize: 11,
      lineHeight: 16,

      fontWeight: "500",
    },

    avatar: {
      width: 56,
      height: 56,

      borderRadius: 19,

      backgroundColor:
        "rgba(255,255,255,0.16)",

      borderWidth: 1,

      borderColor:
        "rgba(255,255,255,0.28)",

      justifyContent:
        "center",

      alignItems:
        "center",
    },

    avatarPressed: {
      opacity: 0.8,
    },

    avatarText: {
      color:
        "#ffffff",

      fontSize: 16,

      fontWeight:
        "900",
    },

    /* Main content */

    contentArea: {
      flex: 1,

      backgroundColor:
        "#f7f7fc",

      borderTopLeftRadius: 22,

      borderTopRightRadius: 22,

      paddingHorizontal: 18,

      paddingTop: 18,

      paddingBottom: 0,

      marginTop: -6,

      overflow:
        "hidden",
    },

    /* Stats */

    statsRow: {
      flexDirection:
        "row",

      gap: 9,

      marginBottom: 15,
    },

    /* Search */

    searchBox: {
      minHeight: 50,

      backgroundColor:
        "#ffffff",

      borderRadius: 15,

      borderWidth: 1,

      borderColor:
        "#eceaf7",

      paddingHorizontal: 11,

      flexDirection: "row",

      alignItems:
        "center",

      marginBottom: 18,
    },

    searchIconWrap: {
      width: 32,
      height: 32,

      borderRadius: 10,

      alignItems:
        "center",

      justifyContent:
        "center",

      backgroundColor:
        "#f2f0ff",

      marginRight: 8,
    },

    searchInput: {
      flex: 1,

      minHeight: 48,

      color:
        "#111827",

      fontSize: 13,

      paddingVertical: 0,
    },

    clearButton: {
      width: 30,
      height: 30,

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    /* Section */

    sectionHeader: {
      flexDirection:
        "row",

      alignItems:
        "center",

      justifyContent:
        "space-between",

      gap: 10,

      marginBottom: 11,
    },

    sectionTitle: {
      color:
        "#171329",

      fontSize: 18,
      lineHeight: 23,

      fontWeight: "900",
    },

    sectionSubtitle: {
      color:
        "#9ca3af",

      fontSize: 10,
      lineHeight: 15,

      fontWeight:
        "600",

      marginTop: 2,
    },

    countBadge: {
      minWidth: 28,
      height: 28,

      borderRadius: 14,

      backgroundColor:
        "#efedff",

      justifyContent:
        "center",

      alignItems:
        "center",

      paddingHorizontal: 8,
    },

    countBadgeText: {
      color:
        "#4d3fe6",

      fontSize: 11,

      fontWeight:
        "900",
    },

    /* Filters */

    filterArea: {
      width: "100%",

      marginBottom: 13,
    },

    filterScroll: {
      flexGrow: 0,
      flexShrink: 0,

      width: "100%",
    },

    filterRow: {
      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 9,

      paddingVertical: 1,

      paddingRight: 80,
    },

    filterChip: {
      minHeight: 40,

      paddingHorizontal: 16,

      borderRadius: 20,

      backgroundColor:
        "#ffffff",

      borderWidth: 1,

      borderColor:
        "#e7e5f3",

      justifyContent:
        "center",

      alignItems:
        "center",
    },

    selectedFilterChip: {
      backgroundColor:
        "#4d3fe6",

      borderColor:
        "#4d3fe6",

      shadowColor:
        "#4d3fe6",

      shadowOpacity:
        0.13,

      shadowRadius: 5,

      shadowOffset: {
        width: 0,
        height: 2,
      },

      elevation: 2,
    },

    filterPressed: {
      opacity: 0.82,
    },

    filterText: {
      color:
        "#5f6470",

      fontSize: 12,

      fontWeight:
        "800",
    },

    selectedFilterText: {
      color:
        "#ffffff",
    },

    /* Remaining vertical area */

    listArea: {
      flex: 1,

      minHeight: 0,

      width: "100%",
    },

    reminderScroll: {
      flex: 1,

      width: "100%",
    },

    reminderScrollContent: {
      flexGrow: 0,

      paddingTop: 1,

      /*
       * Space for FAB
       * and bottom navigation.
       */
      paddingBottom: 110,
    },

    cardWrap: {
      marginBottom: 11,
    },

    /* Action Required */

    actionSection: {
      minHeight: 74,

      flexDirection:
        "row",

      alignItems:
        "center",

      gap: 11,

      marginBottom: 14,

      paddingHorizontal: 13,

      paddingVertical: 12,

      borderRadius: 17,

      backgroundColor:
        "#f2efff",

      borderWidth: 1,

      borderColor:
        "#ddd7ff",
    },

    actionSectionPressed: {
      opacity: 0.82,
    },

    actionIcon: {
      width: 42,
      height: 42,

      borderRadius: 13,

      backgroundColor:
        "#ffffff",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    actionCopy: {
      flex: 1,
      minWidth: 0,
    },

    actionTitle: {
      color:
        "#4d3fe6",

      fontSize: 14,
      lineHeight: 19,

      fontWeight:
        "900",
    },

    actionHint: {
      color:
        "#747986",

      fontSize: 10,
      lineHeight: 16,

      fontWeight:
        "600",

      marginTop: 3,
    },

    actionArrow: {
      width: 30,
      height: 30,

      borderRadius: 10,

      backgroundColor:
        "#ffffff",

      alignItems:
        "center",

      justifyContent:
        "center",
    },

    /* Empty */

    emptyBox: {
      width:
        "100%",

      backgroundColor:
        "#ffffff",

      borderRadius: 18,

      borderWidth: 1,

      borderColor:
        "#eceaf7",

      paddingHorizontal: 24,

      paddingVertical: 32,

      alignItems:
        "center",
    },

    emptyIcon: {
      width: 58,
      height: 58,

      borderRadius: 18,

      backgroundColor:
        "#efedff",

      alignItems:
        "center",

      justifyContent:
        "center",

      marginBottom: 14,
    },

    emptyTitle: {
      color:
        "#111827",

      fontSize: 15,
      lineHeight: 20,

      fontWeight:
        "900",

      textAlign:
        "center",
    },

    emptyText: {
      color:
        "#9ca3af",

      fontSize: 11,
      lineHeight: 18,

      fontWeight:
        "600",

      textAlign:
        "center",

      marginTop: 6,

      maxWidth: 250,
    },

    /* FAB */

    floatingButton: {
      position:
        "absolute",

      right: 20,
      bottom: 16,

      width: 56,
      height: 56,

      borderRadius: 18,

      backgroundColor:
        "#4d3fe6",

      justifyContent:
        "center",

      alignItems:
        "center",

      shadowColor:
        "#4d3fe6",

      shadowOpacity:
        0.28,

      shadowRadius: 9,

      shadowOffset: {
        width: 0,
        height: 5,
      },

      elevation: 8,
    },

    floatingButtonPressed: {
      opacity: 0.85,

      transform: [
        {
          scale: 0.97,
        },
      ],
    },
  });
