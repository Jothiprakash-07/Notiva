import { formatDate, formatTime } from "../../../utils/dateFormat";
import { priorityColors } from "../../../constants/itemColors";
import {
  getItemStatus,
  isItemReadOnly,
} from "../../../utils/itemStatus";

import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";

import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";

import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaView } from "react-native-safe-area-context";

import {
  cancelNotifications,
  scheduleItemNotifications,
} from "../../../services/notificationService";

import {
  saveItem,
  updateItem,
  getItemById,
  rescheduleItem,
} from "../../../services/itemStorage";

import {
  AlertBefore,
  ItemType,
  Priority,
  ReminderItem,
  RepeatType,
} from "../../../types/item";

const categories = [
  "Work",
  "Health",
  "Finance",
  "Personal",
  "Home",
  "Meeting",
  "Other",
];

const alerts: AlertBefore[] = [
  { label: "At Time", minutes: 0 },
  { label: "5 Minutes Before", minutes: 5 },
  { label: "10 Minutes Before", minutes: 10 },
  { label: "30 Minutes Before", minutes: 30 },
  { label: "1 Hour Before", minutes: 60 },
  { label: "1 Day Before", minutes: 1440 },
];

const birthdayAlerts: AlertBefore[] = [
  { label: "Same Day", minutes: 0 },
  { label: "1 Day Before", minutes: 1440 },
  { label: "2 Days Before", minutes: 2880 },
  { label: "1 Week Before", minutes: 10080 },
];

const repeatOptions: {
  label: string;
  value: RepeatType;
}[] = [
  { label: "None", value: "none" },
  { label: "Daily", value: "daily" },
  { label: "Weekly", value: "weekly" },
  { label: "Weekdays", value: "weekdays" },
  { label: "Monthly", value: "monthly" },
  { label: "Yearly", value: "yearly" },
];

function combine(date: Date, time: Date) {
  const result = new Date(date);

  result.setHours(
    time.getHours(),
    time.getMinutes(),
    0,
    0
  );

  return result;
}

function titleFor(type: ItemType) {
  if (type === "reminder") return "New Reminder";
  if (type === "task") return "New Task";
  if (type === "event") return "New Event";

  return "New Birthday";
}

function subtitleFor(type: ItemType) {
  if (type === "reminder") {
    return "Create a reminder for something important.";
  }

  if (type === "task") {
    return "Plan a task and stay on track.";
  }

  if (type === "event") {
    return "Add an event to your schedule.";
  }

  return "Never miss an important birthday.";
}

export default function CreateItemScreen() {
  const params = useLocalSearchParams<{
    type?: string;
    id?: string;
    mode?: string;
    returnToStack?: string;
  }>();

  const type = (params.type || "reminder") as ItemType;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [category, setCategory] =
    useState("Personal");

  const [priority, setPriority] =
    useState<Priority>("Medium");

  const [date, setDate] =
    useState(new Date());

  const [time, setTime] =
    useState(new Date());

  const [endDate, setEndDate] =
    useState(new Date());

  const [endTime, setEndTime] =
    useState(
      new Date(
        Date.now() + 3600000
      )
    );

  const [repeat, setRepeat] =
    useState<RepeatType>(
      type === "birthday"
        ? "yearly"
        : "none"
    );

  const [alertBefore, setAlertBefore] =
    useState<AlertBefore>(
      (
        type === "birthday"
          ? birthdayAlerts
          : alerts
      )[1]
    );

  const [allDay, setAllDay] =
    useState(
      type === "birthday"
    );

  const [location, setLocation] =
    useState("");

  const [notes, setNotes] =
    useState("");

  const [picker, setPicker] =
    useState<
      | "date"
      | "time"
      | "endDate"
      | "endTime"
      | null
    >(null);

  const [error, setError] =
    useState("");

  const [saving, setSaving] =
    useState(false);

  const [loading, setLoading] =
    useState(Boolean(params.id));

  const [
    rescheduling,
    setRescheduling,
  ] = useState(
    params.mode === "reschedule" &&
      Boolean(params.id) &&
      (type === "reminder" ||
        type === "task")
  );

  const [locked, setLocked] =
    useState(false);

  useEffect(() => {
    if (!params.id) return;

    getItemById(params.id)
      .then((item) => {
        if (
          !item ||
          isItemReadOnly(item)
        ) {
          setLocked(true);
          setLoading(false);
          return;
        }

        setRescheduling(
          (item.type === "reminder" ||
            item.type === "task") &&
            (params.mode ===
              "reschedule" ||
              [
                "Missed",
                "Overdue",
              ].includes(
                getItemStatus(item)
              ))
        );

        const start =
          new Date(item.startAt);

        setTitle(item.title);
        setDescription(
          item.description
        );
        setCategory(item.category);

        if (item.priority) {
          setPriority(
            item.priority
          );
        }

        setDate(start);
        setTime(start);

        setRepeat(item.repeat);
        setAlertBefore(
          item.alertBefore
        );

        setAllDay(
          Boolean(item.allDay)
        );

        setLocation(
          item.location || ""
        );

        setNotes(
          item.notes || ""
        );

        if (item.endAt) {
          const end =
            new Date(item.endAt);

          setEndDate(end);
          setEndTime(end);
        }

        setLoading(false);
      })
      .catch(() => {
        setLocked(true);
        setLoading(false);
      });
  }, [
    params.id,
    params.mode,
  ]);

  const onPickerChange = (
    _event: DateTimePickerEvent,
    selected?: Date
  ) => {
    const currentPicker =
      picker;

    setPicker(null);

    if (!selected) {
      return;
    }

    if (
      currentPicker === "date"
    ) {
      setDate(selected);
    } else if (
      currentPicker === "time"
    ) {
      setTime(selected);
    } else if (
      currentPicker ===
      "endDate"
    ) {
      setEndDate(selected);
    } else if (
      currentPicker ===
      "endTime"
    ) {
      setEndTime(selected);
    }
  };

  const savingRef = useRef(false);
  const save = async () => {
    if (
      savingRef.current || saving ||
      loading ||
      locked
    ) {
      return;
    }

    const startAt =
      combine(date, time);

    if (allDay) {
      startAt.setHours(
        0,
        0,
        0,
        0
      );
    }

    const endAt =
      type === "event"
        ? combine(
            endDate,
            endTime
          )
        : undefined;

    if (
      allDay &&
      endAt
    ) {
      endAt.setHours(
        23,
        59,
        59,
        999
      );
    }

    if (!title.trim()) {
      return setError(
        type === "birthday"
          ? "Person name is required."
          : "Title is required."
      );
    }

    if (
      endAt &&
      endAt < startAt
    ) {
      return setError(
        "End time cannot be earlier than start time."
      );
    }

    savingRef.current = true;
    setSaving(true);
    setError("");

    let scheduledIds: string[] =
      [];

    try {
      const existing =
        params.id
          ? await getItemById(
              params.id
            )
          : undefined;

      if (
        params.id &&
        (!existing ||
          isItemReadOnly(
            existing
          ))
      ) {
        setLocked(true);
        return;
      }

      const item: ReminderItem =
        {
          id:
            existing?.id ||
            Date.now() +
              "-" +
              Math.random()
                .toString(36)
                .slice(2),

          type,

          title:
            title.trim(),

          description:
            description.trim(),

          category:
            type === "birthday"
              ? "Birthday"
              : category,

          repeat:
            type === "birthday"
              ? "yearly"
              : repeat,

          priority:
            type === "birthday" ||
            type === "event"
              ? undefined
              : priority,

          startAt:
            startAt.toISOString(),

          endAt:
            endAt?.toISOString(),

          allDay,

          location,
          notes,

          alertBefore,

          completed: false,

          notificationIds: [],

          createdAt:
            existing?.createdAt ||
            new Date().toISOString(),

          updatedAt:
            new Date().toISOString(),
        };

      if (
        existing &&
        (rescheduling ||
          ((existing.type ===
            "reminder" ||
            existing.type ===
              "task") &&
            [
              "Missed",
              "Overdue",
            ].includes(
              getItemStatus(
                existing
              )
            )))
      ) {
        setRescheduling(true);

        await rescheduleItem(
          item
        );

        if (
          params.returnToStack ===
            "1" &&
          router.canGoBack()
        ) {
          router.back();
        } else {
          router.replace(
            "/(tabs)"
          );
        }

        return;
      }

      scheduledIds =
        await scheduleItemNotifications(
          item
        );

      item.notificationIds =
        scheduledIds;

      if (existing) {
        await updateItem({
          ...item,

          notificationIds: [
            ...existing.notificationIds,
            ...scheduledIds,
          ],
        });

        await cancelNotifications(
          existing.notificationIds.filter(id => !scheduledIds.includes(id))
        );

        await updateItem(item);
      } else {
        await saveItem(item);
      }

      router.replace("/(tabs)");
    } catch (error) {
      await cancelNotifications(
        scheduledIds
      ).catch(
        () => undefined
      );

      const message =
        error instanceof Error
          ? error.message
          : "Could not finish saving the item. Please try again.";

      setError(message);

      if (rescheduling) {
        Alert.alert(
          "Could not reschedule item",
          message
        );
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (
    loading ||
    locked
  ) {
    return (
      <SafeAreaView
        style={styles.safe}
      >
        <View
          style={
            styles.stateContainer
          }
        >
          <Ionicons
            name={
              loading
                ? "time-outline"
                : "lock-closed-outline"
            }
            size={32}
            color="#4d3fe6"
          />

          <Text
            style={
              styles.stateTitle
            }
          >
            {loading
              ? "Loading item..."
              : "This item cannot be edited."}
          </Text>

          <Pressable
            style={styles.save}
            onPress={() =>
              params.id
                ? router.replace({
                    pathname:
                      "/screens/details/[id]",

                    params: {
                      id: params.id,
                    },
                  })
                : router.back()
            }
          >
            <Text
              style={
                styles.saveText
              }
            >
              Back to details
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const shownAlerts =
    type === "birthday"
      ? birthdayAlerts
      : alerts;

  const screenTitle =
    params.id
      ? `${
          rescheduling
            ? "Reschedule"
            : "Edit"
        } ${
          type[0].toUpperCase() +
          type.slice(1)
        }`
      : titleFor(type);

  return (
    <SafeAreaView
      style={styles.safe}
    >
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
      />

      {/* Header */}
      <View
        style={styles.header}
      >
        <Pressable
          hitSlop={12}
          style={
            styles.backButton
          }
          onPress={() =>
            router.back()
          }
        >
          <Ionicons
            name="arrow-back"
            size={23}
            color="#111827"
          />
        </Pressable>

        <Text
          numberOfLines={1}
          style={
            styles.headerTitle
          }
        >
          {screenTitle}
        </Text>

        <View
          style={
            styles.headerRightSpace
          }
        />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={
          false
        }
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          styles.content
        }
      >
        {/* Intro */}
        {!params.id ? (
          <View
            style={
              styles.intro
            }
          >
            <Text
              style={
                styles.introTitle
              }
            >
              {titleFor(type)}
            </Text>

            <Text
              style={
                styles.introText
              }
            >
              {subtitleFor(type)}
            </Text>
          </View>
        ) : null}

        {error ? (
          <View
            style={
              styles.errorBox
            }
          >
            <Ionicons
              name="alert-circle-outline"
              size={18}
              color="#dc2626"
            />

            <Text
              style={
                styles.error
              }
            >
              {error}
            </Text>
          </View>
        ) : null}

        {/* Basic information */}
        <View
          style={
            styles.sectionCard
          }
        >
          <Text
            style={
              styles.cardHeading
            }
          >
            Details
          </Text>

          <Text
            style={
              styles.label
            }
          >
            {type === "birthday"
              ? "Person Name"
              : type === "event"
              ? "Event Title"
              : "Title"}
          </Text>

          <TextInput
            style={styles.input}
            value={title}
            onChangeText={
              setTitle
            }
            placeholder={
              type === "birthday"
                ? "Who has a birthday?"
                : "What do you need to remember?"
            }
            placeholderTextColor="#9ca3af"
          />

          <Text
            style={
              styles.label
            }
          >
            {type === "birthday"
              ? "Notes"
              : "Description"}
          </Text>

          <TextInput
            style={[
              styles.input,
              styles.multiline,
            ]}
            value={
              type === "birthday"
                ? notes
                : description
            }
            onChangeText={
              type === "birthday"
                ? setNotes
                : setDescription
            }
            multiline
            placeholder="Add details..."
            placeholderTextColor="#9ca3af"
          />

          {type === "event" ? (
            <View
              style={
                styles.switchRow
              }
            >
              <View>
                <Text
                  style={
                    styles.switchTitle
                  }
                >
                  All Day
                </Text>

                <Text
                  style={
                    styles.switchSubtext
                  }
                >
                  No specific time
                </Text>
              </View>

              <Switch
                value={allDay}
                onValueChange={
                  setAllDay
                }
                trackColor={{
                  false:
                    "#d1d5db",
                  true:
                    "#b9b2ff",
                }}
                thumbColor={
                  allDay
                    ? "#4d3fe6"
                    : "#f9fafb"
                }
              />
            </View>
          ) : null}
        </View>

        {/* Schedule */}
        <View
          style={
            styles.sectionCard
          }
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <View
              style={
                styles.sectionIcon
              }
            >
              <Ionicons
                name="calendar-outline"
                size={19}
                color="#4d3fe6"
              />
            </View>

            <Text
              style={
                styles.cardHeading
              }
            >
              Schedule
            </Text>
          </View>

          <Text
            style={
              styles.label
            }
          >
            When
          </Text>

          <View
            style={
              styles.whenRow
            }
          >
            <Pressable
              style={
                styles.when
              }
              onPress={() =>
                setPicker("date")
              }
            >
              <View
                style={
                  styles.whenIcon
                }
              >
                <Ionicons
                  name="calendar-outline"
                  size={20}
                  color="#4d3fe6"
                />
              </View>

              <View
                style={
                  styles.whenContent
                }
              >
                <Text
                  style={
                    styles.whenLabel
                  }
                >
                  Date
                </Text>

                <Text
                  numberOfLines={1}
                  style={
                    styles.whenText
                  }
                >
                  {formatDate(
                    date,
                    "compact"
                  )}
                </Text>
              </View>
            </Pressable>

            <Pressable
              style={[
                styles.when,

                allDay &&
                  styles.whenDisabled,
              ]}
              onPress={() =>
                setPicker("time")
              }
              disabled={
                allDay
              }
            >
              <View
                style={[
                  styles.whenIcon,

                  allDay &&
                    styles.whenIconDisabled,
                ]}
              >
                <Ionicons
                  name="time-outline"
                  size={20}
                  color={
                    allDay
                      ? "#9ca3af"
                      : "#4d3fe6"
                  }
                />
              </View>

              <View
                style={
                  styles.whenContent
                }
              >
                <Text
                  style={
                    styles.whenLabel
                  }
                >
                  Time
                </Text>

                <Text
                  numberOfLines={1}
                  style={[
                    styles.whenText,

                    allDay &&
                      styles.disabledText,
                  ]}
                >
                  {allDay
                    ? "All day"
                    : formatTime(
                        time
                      )}
                </Text>
              </View>
            </Pressable>
          </View>

          {type === "event" ? (
            <>
              <Text
                style={
                  styles.label
                }
              >
                End
              </Text>

              <View
                style={
                  styles.whenRow
                }
              >
                <Pressable
                  style={
                    styles.when
                  }
                  onPress={() =>
                    setPicker(
                      "endDate"
                    )
                  }
                >
                  <View
                    style={
                      styles.whenIcon
                    }
                  >
                    <Ionicons
                      name="calendar-outline"
                      size={20}
                      color="#4d3fe6"
                    />
                  </View>

                  <View
                    style={
                      styles.whenContent
                    }
                  >
                    <Text
                      style={
                        styles.whenLabel
                      }
                    >
                      End Date
                    </Text>

                    <Text
                      numberOfLines={
                        1
                      }
                      style={
                        styles.whenText
                      }
                    >
                      {formatDate(
                        endDate,
                        "compact"
                      )}
                    </Text>
                  </View>
                </Pressable>

                <Pressable
                  style={[
                    styles.when,

                    allDay &&
                      styles.whenDisabled,
                  ]}
                  onPress={() =>
                    setPicker(
                      "endTime"
                    )
                  }
                  disabled={
                    allDay
                  }
                >
                  <View
                    style={[
                      styles.whenIcon,

                      allDay &&
                        styles.whenIconDisabled,
                    ]}
                  >
                    <Ionicons
                      name="time-outline"
                      size={20}
                      color={
                        allDay
                          ? "#9ca3af"
                          : "#4d3fe6"
                      }
                    />
                  </View>

                  <View
                    style={
                      styles.whenContent
                    }
                  >
                    <Text
                      style={
                        styles.whenLabel
                      }
                    >
                      End Time
                    </Text>

                    <Text
                      numberOfLines={
                        1
                      }
                      style={[
                        styles.whenText,

                        allDay &&
                          styles.disabledText,
                      ]}
                    >
                      {allDay
                        ? "All day"
                        : formatTime(
                            endTime
                          )}
                    </Text>
                  </View>
                </Pressable>
              </View>

              <Text
                style={
                  styles.label
                }
              >
                Location
              </Text>

              <View
                style={
                  styles.inputWithIcon
                }
              >
                <Ionicons
                  name="location-outline"
                  size={19}
                  color="#6b7280"
                />

                <TextInput
                  style={
                    styles.inlineInput
                  }
                  value={
                    location
                  }
                  onChangeText={
                    setLocation
                  }
                  placeholder="Location (optional)"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <Text
                style={
                  styles.label
                }
              >
                Event Notes
              </Text>

              <TextInput
                style={[
                  styles.input,
                  styles.multiline,
                ]}
                value={notes}
                onChangeText={
                  setNotes
                }
                placeholder="Notes (optional)"
                placeholderTextColor="#9ca3af"
                multiline
              />
            </>
          ) : null}
        </View>

        {/* Priority */}
        {type !== "birthday" &&
        type !== "event" ? (
          <View
            style={
              styles.sectionCard
            }
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View
                style={
                  styles.sectionIcon
                }
              >
                <Ionicons
                  name="flag-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <Text
                style={
                  styles.cardHeading
                }
              >
                Priority
              </Text>
            </View>

            <View
              style={
                styles.chips
              }
            >
              {(
                [
                  "High",
                  "Medium",
                  "Low",
                ] as Priority[]
              ).map(
                (value) => {
                  const selected =
                    priority ===
                    value;

                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked:
                          selected,
                      }}
                      style={[
                        styles.chip,

                        {
                          backgroundColor:
                            priorityColors[
                              value
                            ]
                              .backgroundColor,

                          borderColor:
                            selected
                              ? priorityColors[
                                  value
                                ]
                                  .color
                              : "transparent",

                          borderWidth:
                            2,
                        },
                      ]}
                      onPress={() =>
                        setPriority(
                          value
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.chipText,

                          {
                            color:
                              priorityColors[
                                value
                              ]
                                .color,
                          },
                        ]}
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>
          </View>
        ) : null}

        {/* Repeat */}
        <View
          style={
            styles.sectionCard
          }
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <View
              style={
                styles.sectionIcon
              }
            >
              <Ionicons
                name="repeat-outline"
                size={19}
                color="#4d3fe6"
              />
            </View>

            <Text
              style={
                styles.cardHeading
              }
            >
              Repeat
            </Text>
          </View>

          {type !== "birthday" ? (
            <View
              style={
                styles.chips
              }
            >
              {repeatOptions.map(
                (value) => {
                  const active =
                    repeat ===
                    value.value;

                  return (
                    <Pressable
                      key={
                        value.value
                      }
                      style={[
                        styles.chip,
                        active &&
                          styles.active,
                      ]}
                      onPress={() =>
                        setRepeat(
                          value.value
                        )
                      }
                    >
                      <Text
                        style={
                          active
                            ? styles.activeText
                            : styles.chipText
                        }
                      >
                        {value.label}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>
          ) : (
            <View
              style={
                styles.helperBox
              }
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#4d3fe6"
              />

              <Text
                style={
                  styles.helper
                }
              >
                Birthday repeats yearly automatically.
              </Text>
            </View>
          )}
        </View>

        {/* Alert */}
        <View
          style={
            styles.sectionCard
          }
        >
          <View
            style={
              styles.sectionHeader
            }
          >
            <View
              style={
                styles.sectionIcon
              }
            >
              <Ionicons
                name="notifications-outline"
                size={19}
                color="#4d3fe6"
              />
            </View>

            <Text
              style={
                styles.cardHeading
              }
            >
              Alert Before
            </Text>
          </View>

          <View
            style={
              styles.chips
            }
          >
            {shownAlerts.map(
              (value) => {
                const active =
                  alertBefore.label ===
                  value.label;

                return (
                  <Pressable
                    key={
                      value.label
                    }
                    style={[
                      styles.chip,

                      active &&
                        styles.active,
                    ]}
                    onPress={() =>
                      setAlertBefore(
                        value
                      )
                    }
                  >
                    <Text
                      style={
                        active
                          ? styles.activeText
                          : styles.chipText
                      }
                    >
                      {value.label}
                    </Text>
                  </Pressable>
                );
              }
            )}
          </View>
        </View>

        {/* Category */}
        {type !== "birthday" ? (
          <View
            style={
              styles.sectionCard
            }
          >
            <View
              style={
                styles.sectionHeader
              }
            >
              <View
                style={
                  styles.sectionIcon
                }
              >
                <Ionicons
                  name="folder-open-outline"
                  size={19}
                  color="#4d3fe6"
                />
              </View>

              <Text
                style={
                  styles.cardHeading
                }
              >
                Category
              </Text>
            </View>

            <View
              style={
                styles.chips
              }
            >
              {categories.map(
                (value) => {
                  const active =
                    category ===
                    value;

                  return (
                    <Pressable
                      key={value}
                      style={[
                        styles.chip,

                        active &&
                          styles.active,
                      ]}
                      onPress={() =>
                        setCategory(
                          value
                        )
                      }
                    >
                      <Text
                        style={
                          active
                            ? styles.activeText
                            : styles.chipText
                        }
                      >
                        {value}
                      </Text>
                    </Pressable>
                  );
                }
              )}
            </View>
          </View>
        ) : null}

        {/* Save */}
        <Pressable
          style={({ pressed }) => [
            styles.save,

            pressed &&
              !saving &&
              styles.savePressed,

            saving &&
              styles.saveDisabled,
          ]}
          onPress={save}
          disabled={saving}
        >
          <Text
            style={
              styles.saveText
            }
          >
            {saving
              ? "Saving..."
              : rescheduling
              ? "Save Reschedule"
              : `Save ${
                  type ===
                  "reminder"
                    ? "Reminder"
                    : type ===
                      "task"
                    ? "Task"
                    : type ===
                      "event"
                    ? "Event"
                    : "Birthday"
                }`}
          </Text>

          {saving ? null : (
            <Ionicons
              name="arrow-forward"
              size={20}
              color="#ffffff"
            />
          )}
        </Pressable>
      </ScrollView>

      {picker ? (
        <DateTimePicker
          value={
            picker === "date"
              ? date
              : picker === "time"
              ? time
              : picker ===
                "endDate"
              ? endDate
              : endTime
          }
          mode={
            picker
              .toLowerCase()
              .includes("time")
              ? "time"
              : "date"
          }
          display={
            Platform.OS ===
            "ios"
              ? "spinner"
              : "default"
          }
          onChange={
            onPickerChange
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles =
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor:
        "#f7f7fc",
    },

    header: {
      height: 62,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      paddingHorizontal: 18,
      backgroundColor:
        "#ffffff",
      borderBottomWidth: 1,
      borderBottomColor:
        "#f0eff7",
    },

    backButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: "center",
      justifyContent:
        "center",
    },

    headerTitle: {
      flex: 1,
      textAlign: "center",
      fontSize: 19,
      lineHeight: 24,
      fontWeight: "900",
      color: "#111827",
      paddingHorizontal: 8,
    },

    headerRightSpace: {
      width: 38,
      height: 38,
    },

    content: {
      paddingHorizontal: 18,
      paddingTop: 20,
      paddingBottom: 45,
    },

    intro: {
      marginBottom: 20,
    },

    introTitle: {
      fontSize: 26,
      lineHeight: 32,
      fontWeight: "900",
      color: "#171329",
      marginBottom: 5,
    },

    introText: {
      fontSize: 14,
      lineHeight: 21,
      color: "#6b7280",
    },

    sectionCard: {
      backgroundColor:
        "#ffffff",
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      borderWidth: 1,
      borderColor:
        "#efedf8",

      shadowColor:
        "#171329",
      shadowOpacity: 0.035,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 1,
    },

    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 16,
    },

    sectionIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor:
        "#efedff",
      alignItems: "center",
      justifyContent:
        "center",
    },

    cardHeading: {
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "900",
      color: "#171329",
    },

    label: {
      fontSize: 13,
      lineHeight: 18,
      color: "#374151",
      fontWeight: "700",
      marginBottom: 7,
      marginTop: 2,
    },

    input: {
      width: "100%",
      minHeight: 52,
      borderWidth: 1,
      borderColor:
        "#deddf0",
      borderRadius: 13,
      paddingHorizontal: 14,
      color: "#111827",
      fontSize: 14,
      backgroundColor:
        "#fafaff",
      marginBottom: 15,
    },

    multiline: {
      minHeight: 96,
      paddingTop: 13,
      paddingBottom: 13,
      textAlignVertical:
        "top",
    },

    inputWithIcon: {
      minHeight: 52,
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor:
        "#deddf0",
      borderRadius: 13,
      backgroundColor:
        "#fafaff",
      paddingHorizontal: 14,
      marginBottom: 15,
    },

    inlineInput: {
      flex: 1,
      color: "#111827",
      fontSize: 14,
      minHeight: 50,
    },

    whenRow: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
      marginBottom: 16,
    },

    when: {
      flex: 1,
      minWidth: 0,
      minHeight: 68,
      borderWidth: 1,
      borderColor:
        "#deddf0",
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 11,
      gap: 9,
      backgroundColor:
        "#fafaff",
    },

    whenDisabled: {
      backgroundColor:
        "#f5f5f7",
      borderColor:
        "#e5e7eb",
    },

    whenIcon: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent:
        "center",
      backgroundColor:
        "#efedff",
    },

    whenIconDisabled: {
      backgroundColor:
        "#e5e7eb",
    },

    whenContent: {
      flex: 1,
      minWidth: 0,
    },

    whenLabel: {
      fontSize: 10,
      lineHeight: 14,
      color: "#6b7280",
      marginBottom: 2,
      fontWeight: "600",
    },

    whenText: {
      color: "#171329",
      fontWeight: "800",
      fontSize: 12,
    },

    disabledText: {
      color: "#9ca3af",
    },

    chips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 9,
      width: "100%",
    },

    chip: {
      minHeight: 38,
      borderRadius: 19,
      borderWidth: 1,
      borderColor:
        "#cfcaff",
      paddingHorizontal: 15,
      paddingVertical: 8,
      justifyContent:
        "center",
      alignItems: "center",
      backgroundColor:
        "#ffffff",
    },

    active: {
      backgroundColor:
        "#4d3fe6",
      borderColor:
        "#4d3fe6",
    },

    chipText: {
      color: "#4d3fe6",
      fontWeight: "700",
      fontSize: 12,
    },

    activeText: {
      color: "#ffffff",
      fontWeight: "800",
      fontSize: 12,
    },

    switchRow: {
      minHeight: 58,
      flexDirection: "row",
      justifyContent:
        "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor:
        "#f0eff7",
      paddingTop: 12,
    },

    switchTitle: {
      fontSize: 14,
      lineHeight: 19,
      color: "#111827",
      fontWeight: "800",
    },

    switchSubtext: {
      fontSize: 11,
      lineHeight: 16,
      color: "#9ca3af",
      marginTop: 2,
    },

    helperBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor:
        "#f4f2ff",
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },

    helper: {
      flex: 1,
      color: "#6b7280",
      fontSize: 12,
      lineHeight: 18,
    },

    errorBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      paddingHorizontal: 13,
      paddingVertical: 11,
      borderRadius: 12,
      backgroundColor:
        "#fef2f2",
      borderWidth: 1,
      borderColor:
        "#fecaca",
      marginBottom: 14,
    },

    error: {
      flex: 1,
      color: "#dc2626",
      fontWeight: "700",
      fontSize: 12,
      lineHeight: 18,
    },

    save: {
      width: "100%",
      minHeight: 56,
      marginTop: 8,
      backgroundColor:
        "#4d3fe6",
      borderRadius: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 9,

      shadowColor:
        "#4d3fe6",
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 4,
      },

      elevation: 3,
    },

    savePressed: {
      opacity: 0.86,
    },

    saveDisabled: {
      opacity: 0.65,
    },

    saveText: {
      color: "#ffffff",
      fontWeight: "900",
      fontSize: 15,
    },

    stateContainer: {
      flex: 1,
      paddingHorizontal: 24,
      alignItems: "center",
      justifyContent:
        "center",
    },

    stateTitle: {
      marginTop: 14,
      marginBottom: 18,
      color: "#171329",
      fontSize: 16,
      fontWeight: "800",
      textAlign: "center",
    },
  });
