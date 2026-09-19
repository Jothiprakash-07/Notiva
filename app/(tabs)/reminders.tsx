import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import CompletionNoteModal from "../../components/common/CompletionNoteModal";
import { formatDate, formatTime } from "../../utils/dateFormat";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  router,
  useFocusEffect,
  useLocalSearchParams,
} from "expo-router";
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
} from "react";
import {
  Alert,
  BackHandler,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReminderCard from "../../components/home/ReminderCard";
import {
  getItems,
  deleteItem,
  toggleComplete,
} from "../../services/itemStorage";
import { ReminderItem } from "../../types/item";
import {
  getItemStatus,
  isCountedAsDone,
  isCountedAsOverdue,
  withCalculatedStatus,
} from "../../utils/itemStatus";
import { sortItemsByStatus } from "../../utils/itemSorting";

type DateRange = { from: Date | null; to: Date | null };
type DateField = "from" | "to";

// Calendar boundaries use the phone's local timezone, including DST changes.
function localDay(date: Date, nextDay = false): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + (nextDay ? 1 : 0));
}

function dateRangeLabel({ from, to }: DateRange): string {
  if (from && to) return formatDate(from, "shortYear") + " - " + formatDate(to, "shortYear");
  if (from) return "From " + formatDate(from, "shortYear");
  return to ? "Up to " + formatDate(to, "shortYear") : "";
}

type ListFilter =
  | "all"
  | "done"
  | "pending"
  | "overdue";

const filters: {
  label: string;
  value: ListFilter;
  icon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    label: "All",
    value: "all",
    icon: "list-outline",
  },
  {
    label: "Pending",
    value: "pending",
    icon: "time-outline",
  },
  {
    label: "Done",
    value: "done",
    icon: "checkmark-circle-outline",
  },
  {
    label: "Overdue",
    value: "overdue",
    icon: "alert-circle-outline",
  },
];

function normalizeFilter(
  value?: string | string[]
): ListFilter {
  const selected =
    Array.isArray(value)
      ? value[0]
      : value;

  return selected === "done" ||
    selected === "pending" ||
    selected === "overdue"
    ? selected
    : "all";
}

function displayItem(
  item: ReminderItem
) {
  const start =
    new Date(item.startAt);

  return {
    time: item.allDay
      ? "All day"
      : formatTime(start),

    date: formatDate(
      start,
      "shortYear"
    ),
  };
}

function filterTitle(
  filter: ListFilter
) {
  if (filter === "pending") {
    return "Pending items";
  }

  if (filter === "done") {
    return "Completed items";
  }

  if (filter === "overdue") {
    return "Needs attention";
  }

  return "All reminders";
}

function emptyContent(
  filter: ListFilter
) {
  if (filter === "pending") {
    return {
      icon: "time-outline" as const,
      title: "No pending items",
      text: "Pending reminders and tasks, and upcoming or ongoing events will appear here.",
    };
  }

  if (filter === "done") {
    return {
      icon:
        "checkmark-done-circle-outline" as const,
      title: "No completed items",
      text:
        "Items you complete will appear here.",
    };
  }

  if (filter === "overdue") {
    return {
      icon:
        "time-outline" as const,
      title: "No overdue items",
      text:
        "Missed reminders and overdue tasks will appear here.",
    };
  }

  return {
    icon:
      "notifications-outline" as const,
    title: "No items yet",
    text:
      "Create a reminder, task, event, or birthday to get started.",
  };
}

export default function RemindersScreen() {
  const params =
    useLocalSearchParams<{
      filter?:
        | string
        | string[];
    }>();

  const selectedFilter =
    normalizeFilter(
      params.filter
    );

  const [items, setItems] =
    useState<ReminderItem[]>(
      []
    );

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const deleteLock = useRef(false);
  const selectionActive = useRef(false);
  const selectionVersion = useRef(0);
  const confirmationPending = useRef(false);
  const exitSelection = useCallback(() => {
    selectionVersion.current += 1;
    selectionActive.current = false;
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  useFocusEffect(useCallback(() => {
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (deleteLock.current) return true;
      if (!selectionActive.current) return false;
      exitSelection();
      return true;
    });
    return () => { listener.remove(); exitSelection(); };
  }, [exitSelection]));

  // Cover status filters changed through route params as well as the chips.
  useEffect(() => { exitSelection(); }, [selectedFilter, exitSelection]);

  const [searchText, setSearchText] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ from: null, to: null });
  const [draftRange, setDraftRange] = useState<DateRange>({ from: null, to: null });
  const [dateFilterVisible, setDateFilterVisible] = useState(false);
  const [datePickerField, setDatePickerField] = useState<DateField | null>(null);
  const [pickerDate, setPickerDate] = useState(new Date());
  const hasDateFilter = Boolean(dateRange.from || dateRange.to);

  const openDateFilter = () => {
    if (deleteLock.current) return;
    Keyboard.dismiss();
    setDraftRange({ ...dateRange });
    setDatePickerField(null);
    setDateFilterVisible(true);
  };
  const closeDateFilter = () => {
    setDatePickerField(null);
    setDateFilterVisible(false);
  };
  const clearDateFilter = () => {
    if (deleteLock.current) return;
    exitSelection();
    setDateRange({ from: null, to: null });
    setDraftRange({ from: null, to: null });
    closeDateFilter();
  };
  const applyDateFilter = () => {
    if (draftRange.from && draftRange.to && draftRange.from > draftRange.to) {
      Alert.alert("From date must be before To date.");
      return;
    }
    if (deleteLock.current) return;
    exitSelection();
    setDateRange({ ...draftRange });
    closeDateFilter();
  };
  const openDatePicker = (field: DateField) => {
    setPickerDate(draftRange[field] ?? draftRange.from ?? draftRange.to ?? new Date());
    setDatePickerField(field);
  };
  const selectPickerDate = (date: Date) => {
    if (datePickerField) {
      setDraftRange(current => ({ ...current, [datePickerField]: localDay(date) }));
    }
    setDatePickerField(null);
  };
  const onDatePickerChange = (event: DateTimePickerEvent, date?: Date) => {
    if (event.type !== "set" || !date) {
      setDatePickerField(null);
      return;
    }
    if (Platform.OS === "ios") setPickerDate(date);
    else selectPickerDate(date);
  };

  const refresh =
    useCallback(async () => {
      const stored =
        await getItems();

      setItems(
        stored.map(
          (item) =>
            withCalculatedStatus(
              item
            )
        )
      );
    }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      const load =
        async () => {
          try {
            const stored =
              await getItems();

            if (active) {
              setItems(
                stored.map(
                  (item) =>
                    withCalculatedStatus(
                      item
                    )
                )
              );
            }
          } catch {
            if (active) {
              Alert.alert(
                "Could not load items",
                "Please reopen Reminders to try again."
              );
            }
          }
        };

      void load();

      const timer =
        setInterval(() => {
          if (active) {
            setItems(
              (current) =>
                current.map(
                  (item) =>
                    withCalculatedStatus(
                      item
                    )
                )
            );
          }
        }, 30_000);

      return () => {
        active = false;
        clearInterval(timer);
      };
    }, [])
  );

  const filteredItems = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const from = dateRange.from ? localDay(dateRange.from).getTime() : null;
    // Exclusive next-day bound includes every instant of the selected To Date.
    const until = dateRange.to ? localDay(dateRange.to, true).getTime() : null;
    const matching = items.filter(item => {
      if (selectedFilter === "done" && !isCountedAsDone(item)) return false;
      if (selectedFilter === "overdue" && !isCountedAsOverdue(item)) return false;
      if (selectedFilter === "pending") {
        const status = getItemStatus(item);
        if (item.type === "birthday" || !["Pending", "Upcoming", "Ongoing"].includes(status)) return false;
      }
      if (query && ![item.title, item.description, item.category, item.type]
        .some(value => value?.toLowerCase().includes(query))) return false;
      if (from !== null || until !== null) {
        const startAt = new Date(item.startAt).getTime();
        if (!Number.isFinite(startAt)) return false;
        if (from !== null && startAt < from) return false;
        if (until !== null && startAt >= until) return false;
      }
      return true;
    });
    return sortItemsByStatus(matching);
  }, [items, selectedFilter, searchText, dateRange]);

  useEffect(() => {
    if (selectionMode && [...selectedIds].some(id => !filteredItems.some(item => item.id === id))) exitSelection();
  }, [filteredItems, selectedIds, selectionMode, exitSelection]);

  const startSelection = (id: string) => {
    if (deleteLock.current || selectionActive.current) return;
    Keyboard.dismiss();
    selectionVersion.current += 1;
    selectionActive.current = true;
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };
  const toggleSelection = (id: string) => {
    if (deleteLock.current) return;
    selectionVersion.current += 1;
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allVisibleSelected = filteredItems.length > 0 && filteredItems.every(item => selectedIds.has(item.id));
  const selectAll = () => {
    if (deleteLock.current) return;
    selectionVersion.current += 1;
    setSelectedIds(allVisibleSelected ? new Set() : new Set(filteredItems.map(item => item.id)));
  };
  const changeSearch = (text: string) => {
    if (deleteLock.current) return;
    exitSelection();
    setSearchText(text);
  };
  const requestDelete = () => {
    if (deleteLock.current || confirmationPending.current || !selectedIds.size) return;
    const ids = filteredItems.filter(item => selectedIds.has(item.id)).map(item => item.id);
    if (!ids.length) return;
    const version = selectionVersion.current;
    confirmationPending.current = true;
    Alert.alert(ids.length === 1 ? "Delete this reminder?" : `Delete ${ids.length} reminders?`, "This action cannot be undone.", [
      { text: "Cancel", style: "cancel", onPress: () => { confirmationPending.current = false; } },
      { text: "Delete", style: "destructive", onPress: async () => {
        confirmationPending.current = false;
        // Changed filters, selection or focus invalidate an older confirmation.
        if (deleteLock.current || version !== selectionVersion.current || !selectionActive.current) return;
        deleteLock.current = true;
        setDeleting(true);
        try {
          const results = await Promise.allSettled(ids.map(id => deleteItem(id)));
          const deletedIds = new Set(ids.filter((_, index) => results[index].status === "fulfilled"));
          const failed = results.length - deletedIds.size;
          // Keep confirmed successes removed even if the storage reload fails.
          setItems(current => current.filter(item => !deletedIds.has(item.id)));
          let refreshed = true;
          try { await refresh(); } catch { refreshed = false; }
          exitSelection();
          if (failed || !refreshed) {
            Alert.alert("Could not finish deleting reminders",
              `${deletedIds.size} deleted. ${failed ? `${failed} could not be deleted. Select them again to retry. ` : ""}${!refreshed ? "Could not refresh the list. Reopen Reminders to reload it." : ""}`);
          } else {
            Alert.alert(ids.length === 1 ? "Reminder deleted." : `${ids.length} reminders deleted.`);
          }
        } finally {
          deleteLock.current = false;
          setDeleting(false);
        }
      } },
    ], { cancelable: true, onDismiss: () => { confirmationPending.current = false; } });
  };

  const [completionItemId, setCompletionItemId] = useState<string | null>(null);
  const [completionSaving, setCompletionSaving] = useState(false);

  const handleToggle = (id: string) => {
    if (selectionActive.current || deleteLock.current) return;
    const selected = items.find(item => item.id === id);
    if (selected && !selected.completed && selected.status !== "Done") setCompletionItemId(id);
  };

  const confirmCompletion = async (note?: string) => {
    if (!completionItemId || completionSaving) return;
    setCompletionSaving(true);
    try {
      const updated = await toggleComplete(completionItemId, note);
      if (!updated?.completed) throw new Error("Item could not be completed.");
      await refresh();
      setCompletionItemId(null);
    } catch (error) {
      Alert.alert("Could not complete item", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setCompletionSaving(false);
    }
  };

  const empty =
    emptyContent(
      selectedFilter
    );

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={[
        "top",
        "left",
        "right",
      ]}
    >
      {/* Header */}
      <View
        style={styles.header}
      >
        <View>
          <Text
            allowFontScaling={
              false
            }
            style={styles.title}
          >
            Reminders
          </Text>

          <Text
            allowFontScaling={
              false
            }
            style={
              styles.subtitle
            }
          >
            Keep track of everything important
          </Text>
        </View>

        <View
          style={
            styles.headerCount
          }
        >
          <Text
            style={
              styles.headerCountNumber
            }
          >
            {
              filteredItems.length
            }
          </Text>

          <Text
            style={
              styles.headerCountLabel
            }
          >
            {filteredItems.length ===
            1
              ? "item"
              : "items"}
          </Text>
        </View>
      </View>

      <View
        style={
          styles.container
        }
      >
        {/* Filter title */}
        <View
          style={
            styles.sectionTop
          }
        >
          <View>
            <Text
              style={
                styles.sectionTitle
              }
            >
              {filterTitle(
                selectedFilter
              )}
            </Text>

            <Text
              style={
                styles.sectionSubtitle
              }
            >
              {filteredItems.length}{" "}
              {filteredItems.length ===
              1
                ? "result"
                : "results"}
            </Text>
          </View>
        </View>

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={18} color="#8b8f9c" />
            <TextInput accessibilityLabel="Search reminders" placeholder="Search reminders" placeholderTextColor="#8b8f9c"
              value={searchText} onChangeText={changeSearch} style={styles.searchInput} returnKeyType="search" />
            {searchText ? <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => changeSearch("")}>
              <Ionicons name="close-circle" size={18} color="#8b8f9c" />
            </Pressable> : null}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Date Filter" onPress={openDateFilter}
            style={({ pressed }) => [styles.dateFilterButton, hasDateFilter && styles.dateFilterActive, pressed && styles.filterPressed]}>
            <Ionicons name="calendar-outline" size={17} color="#4d3fe6" />
            <Text style={styles.filterText}>Date Filter</Text>
          </Pressable>
        </View>

        {/* Filters */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={
            false
          }
          contentContainerStyle={
            styles.filters
          }
          style={
            styles.filterScroll
          }
        >
          {filters.map(
            (filter) => {
              const selected =
                filter.value ===
                selectedFilter;

              return (
                <Pressable
                  key={
                    filter.value
                  }
                  accessibilityRole="button"
                  accessibilityState={{
                    selected,
                  }}
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
                    router.setParams(
                      {
                        filter:
                          filter.value,
                      }
                    )
                  }
                >
                  <Ionicons
                    name={
                      filter.icon
                    }
                    size={17}
                    color={
                      selected
                        ? "#ffffff"
                        : "#4d3fe6"
                    }
                  />

                  <Text
                    style={[
                      styles.filterText,

                      selected &&
                        styles.selectedFilterText,
                    ]}
                  >
                    {
                      filter.label
                    }
                  </Text>
                </Pressable>
              );
            }
          )}
        </ScrollView>

        {hasDateFilter ? (
          <View style={styles.activeDateFilter}>
            <Text style={styles.activeDateText}>{dateRangeLabel(dateRange)}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Clear Date Filter" hitSlop={8} onPress={clearDateFilter}>
              <Ionicons name="close" size={18} color="#4d3fe6" />
            </Pressable>
          </View>
        ) : null}

        {selectionMode ? (
          <View style={styles.selectionBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit selection mode"
              hitSlop={8}
              onPress={exitSelection}
              style={styles.selectionIconButton}
            >
              <Ionicons name="close" size={21} color="#4d3fe6" />
            </Pressable>

            <Text style={styles.selectionCount}>
              {selectedIds.size} {selectedIds.size === 1 ? "Selected" : "Selected"}
            </Text>

            <Pressable
              accessibilityRole="button"
              disabled={deleting || filteredItems.length === 0}
              onPress={selectAll}
              style={({ pressed }) => [
                styles.selectAllButton,
                pressed && styles.filterPressed,
                (deleting || filteredItems.length === 0) && styles.selectionDisabled,
              ]}
            >
              <Text style={styles.selectAllText}>
                {allVisibleSelected ? "Clear All" : "Select All"}
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete selected reminders"
              disabled={deleting || selectedIds.size === 0}
              onPress={requestDelete}
              style={({ pressed }) => [
                styles.deleteSelectionButton,
                pressed && styles.filterPressed,
                (deleting || selectedIds.size === 0) && styles.selectionDisabled,
              ]}
            >
              <Ionicons name="trash-outline" size={18} color="#ffffff" />
              <Text style={styles.deleteSelectionText}>
                {deleting ? "Deleting..." : "Delete"}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* List */}
        <ScrollView
          style={styles.list}
          contentContainerStyle={[
            styles.listContent,

            filteredItems.length ===
              0 &&
              styles.emptyListContent,
          ]}
          showsVerticalScrollIndicator={
            false
          }
        >
          {filteredItems.length >
          0 ? (
            filteredItems.map(
              (item) => {
                const shown =
                  displayItem(
                    item
                  );

                const status =
                  getItemStatus(
                    item
                  );

                return (
                  <View
                    key={item.id}
                    style={
                      styles.cardWrap
                    }
                  >
                    <ReminderCard
                      id={item.id}
                      title={
                        item.title
                      }
                      time={
                        shown.time
                      }
                      date={
                        shown.date
                      }
                      category={
                        item.category
                      }
                      priority={
                        item.priority
                      }
                      status={
                        status
                      }
                      type={
                        item.type
                      }
                      onPress={() =>
                        router.push(
                          `/screens/details/${item.id}` as any
                        )
                      }
                      onToggle={() =>
                        handleToggle(
                          item.id
                        )
                      }
                      selectionMode={selectionMode}
                      selected={selectedIds.has(item.id)}
                      onLongPress={() =>
                        startSelection(item.id)
                      }
                      onSelect={() =>
                        toggleSelection(item.id)
                      }
                      disabled={deleting}
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
                  name={
                    empty.icon
                  }
                  size={30}
                  color="#4d3fe6"
                />
              </View>

              <Text
                style={
                  styles.emptyTitle
                }
              >
                {hasDateFilter ? "No reminders found for this date range." : searchText.trim() ? "No matching reminders" : empty.title}
              </Text>

              <Text
                style={
                  styles.emptyText
                }
              >
                {hasDateFilter || searchText.trim() ? "Try adjusting your filters or search." : empty.text}
              </Text>
              {hasDateFilter ? <Pressable accessibilityRole="button" onPress={clearDateFilter} style={styles.clearDateAction}>
                <Text style={styles.filterText}>Clear Date Filter</Text>
              </Pressable> : null}
            </View>
          )}
        </ScrollView>
      </View>
      <Modal visible={dateFilterVisible} transparent animationType="fade" onRequestClose={closeDateFilter}>
        <View style={styles.dateModalOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss date filter" style={StyleSheet.absoluteFillObject} onPress={closeDateFilter} />
          <View style={styles.dateModalCard} accessibilityViewIsModal>
            <View style={styles.dateModalHeader}>
              <Text style={styles.sectionTitle}>Filter by Date</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close date filter" hitSlop={10} onPress={closeDateFilter}>
                <Ionicons name="close" size={22} color="#6b7280" />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {(["from", "to"] as const).map(field => (
                <View key={field} style={styles.dateFieldGroup}>
                  <Text style={styles.dateFieldLabel}>{field === "from" ? "From Date" : "To Date"}</Text>
                  <View style={styles.dateFieldRow}>
                    <Pressable accessibilityRole="button" accessibilityLabel={field === "from" ? "Select From Date" : "Select To Date"}
                      onPress={() => openDatePicker(field)} style={styles.dateField}>
                      <Text style={[styles.dateFieldText, !draftRange[field] && styles.datePlaceholder]}>
                        {draftRange[field] ? formatDate(draftRange[field]) : field === "from" ? "Select From Date" : "Select To Date"}
                      </Text>
                      <Ionicons name="calendar-outline" size={19} color="#4d3fe6" />
                    </Pressable>
                    {draftRange[field] ? <Pressable accessibilityRole="button" accessibilityLabel={field === "from" ? "Clear From Date" : "Clear To Date"}
                      hitSlop={8} onPress={() => { setDatePickerField(null); setDraftRange(current => ({ ...current, [field]: null })); }}>
                      <Ionicons name="close-circle-outline" size={20} color="#8b8f9c" />
                    </Pressable> : null}
                  </View>
                </View>
              ))}
              {datePickerField ? <View>
                <DateTimePicker value={pickerDate} mode="date" display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDatePickerChange} />
                {Platform.OS === "ios" ? <Pressable accessibilityRole="button" onPress={() => selectPickerDate(pickerDate)} style={styles.clearDateAction}>
                  <Text style={styles.filterText}>Select Date</Text>
                </Pressable> : null}
              </View> : null}
              <View style={styles.dateModalActions}>
                <Pressable accessibilityRole="button" onPress={clearDateFilter} style={styles.resetDateButton}><Text style={styles.filterText}>Reset</Text></Pressable>
                <Pressable accessibilityRole="button" disabled={datePickerField !== null} onPress={applyDateFilter}
                  style={[styles.applyDateButton, datePickerField !== null && styles.filterPressed]}>
                  <Text style={styles.selectedFilterText}>Apply</Text>
                </Pressable>
              </View>
              <Pressable accessibilityRole="button" onPress={closeDateFilter} style={styles.clearDateAction}><Text style={styles.datePlaceholder}>Cancel</Text></Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    selectionBar: {
      marginHorizontal: 18,
      marginBottom: 12,
      minHeight: 52,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#ddd8fb",
      backgroundColor: "#ffffff",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    selectionIconButton: {
      width: 34,
      height: 34,
      borderRadius: 10,
      backgroundColor: "#efedff",
      alignItems: "center",
      justifyContent: "center",
    },
    selectionCount: {
      flex: 1,
      color: "#171329",
      fontSize: 12,
      fontWeight: "900",
    },
    selectAllButton: {
      minHeight: 36,
      paddingHorizontal: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#d8d3fc",
      backgroundColor: "#f5f3ff",
      alignItems: "center",
      justifyContent: "center",
    },
    selectAllText: {
      color: "#4d3fe6",
      fontSize: 10,
      fontWeight: "900",
    },
    deleteSelectionButton: {
      minHeight: 36,
      paddingHorizontal: 11,
      borderRadius: 10,
      backgroundColor: "#dc2626",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
    },
    deleteSelectionText: {
      color: "#ffffff",
      fontSize: 10,
      fontWeight: "900",
    },
    selectionDisabled: {
      opacity: 0.45,
    },
    searchRow: { flexDirection: "row", gap: 9, paddingHorizontal: 18, marginBottom: 14 },
    searchBox: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, borderWidth: 1, borderColor: "#e7e5f3", borderRadius: 12, backgroundColor: "#ffffff" },
    searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 12, color: "#171329", paddingVertical: 10 },
    dateFilterButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, minHeight: 44, borderWidth: 1, borderColor: "#e7e5f3", borderRadius: 12, backgroundColor: "#ffffff" },
    dateFilterActive: { backgroundColor: "#efedff", borderColor: "#d8d3fc" },
    activeDateFilter: { alignSelf: "flex-start", maxWidth: "90%", flexDirection: "row", alignItems: "center", gap: 10, marginHorizontal: 18, marginBottom: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: "#efedff", borderRadius: 10 },
    activeDateText: { flexShrink: 1, color: "#4d3fe6", fontSize: 12, fontWeight: "700" },
    clearDateAction: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 8 },
    dateModalOverlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 22, backgroundColor: "rgba(23,19,41,0.5)" },
    dateModalCard: { width: "100%", maxWidth: 420, maxHeight: "90%", backgroundColor: "#ffffff", borderRadius: 22, padding: 22 },
    dateModalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 22 },
    dateFieldGroup: { marginBottom: 18 },
    dateFieldLabel: { color: "#636674", fontSize: 12, fontWeight: "700", marginBottom: 8 },
    dateFieldRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    dateField: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, minHeight: 50, paddingHorizontal: 13, borderRadius: 12, borderWidth: 1, borderColor: "#e7e5f3", backgroundColor: "#faf9ff" },
    dateFieldText: { flexShrink: 1, color: "#171329", fontSize: 13, fontWeight: "600" },
    datePlaceholder: { color: "#8b8f9c", fontSize: 12 },
    dateModalActions: { flexDirection: "row", gap: 12, marginTop: 4 },
    resetDateButton: { flex: 1, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: "#e7e5f3", alignItems: "center", justifyContent: "center" },
    applyDateButton: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: "#4d3fe6", alignItems: "center", justifyContent: "center" },
    safeArea: {
      flex: 1,
      backgroundColor:
        "#4d3fe6",
    },

    header: {
      minHeight: 105,
      backgroundColor:
        "#4d3fe6",
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 20,

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "space-between",
      gap: 15,
    },

    title: {
      color: "#ffffff",
      fontSize: 25,
      lineHeight: 31,
      fontWeight: "900",
    },

    subtitle: {
      color: "#d8d5ff",
      fontSize: 12,
      lineHeight: 18,
      fontWeight: "600",
      marginTop: 3,
    },

    headerCount: {
      minWidth: 58,
      minHeight: 58,
      paddingHorizontal: 10,
      borderRadius: 18,
      backgroundColor:
        "rgba(255,255,255,0.13)",
      alignItems: "center",
      justifyContent:
        "center",
    },

    headerCountNumber: {
      color: "#ffffff",
      fontSize: 19,
      lineHeight: 22,
      fontWeight: "900",
    },

    headerCountLabel: {
      color: "#d8d5ff",
      fontSize: 9,
      lineHeight: 13,
      fontWeight: "700",
      marginTop: 1,
    },

    container: {
      flex: 1,
      backgroundColor:
        "#f7f7fc",
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 18,
      overflow: "hidden",
    },

    sectionTop: {
      paddingHorizontal: 18,
      marginBottom: 14,
    },

    sectionTitle: {
      color: "#171329",
      fontSize: 18,
      lineHeight: 23,
      fontWeight: "900",
    },

    sectionSubtitle: {
      color: "#8b8f9c",
      fontSize: 11,
      lineHeight: 16,
      fontWeight: "600",
      marginTop: 3,
    },

    filterScroll: {
      flexGrow: 0,
      marginBottom: 14,
    },

    filters: {
      flexDirection: "row",
      gap: 9,
      paddingHorizontal: 18,
      paddingRight: 28,
    },

    filterChip: {
      minHeight: 40,
      minWidth: 86,
      borderRadius: 20,
      backgroundColor:
        "#ffffff",
      borderWidth: 1,
      borderColor:
        "#e7e5f3",

      flexDirection: "row",
      alignItems: "center",
      justifyContent:
        "center",
      gap: 7,

      paddingHorizontal: 15,
    },

    selectedFilterChip: {
      backgroundColor:
        "#4d3fe6",
      borderColor:
        "#4d3fe6",

      shadowColor:
        "#4d3fe6",
      shadowOpacity: 0.15,
      shadowRadius: 6,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 2,
    },

    filterPressed: {
      opacity: 0.8,
    },

    filterText: {
      color: "#4d3fe6",
      fontSize: 12,
      fontWeight: "800",
    },

    selectedFilterText: {
      color: "#ffffff",
    },

    list: {
      flex: 1,
    },

    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 110,
    },

    cardWrap: {
      marginBottom: 11,
    },

    emptyListContent: {
      flexGrow: 1,
      justifyContent:
        "center",
      paddingBottom: 130,
    },

    emptyBox: {
      width: "100%",
      maxWidth: 360,
      alignSelf: "center",

      backgroundColor:
        "#ffffff",
      borderRadius: 20,
      paddingHorizontal: 26,
      paddingVertical: 34,

      alignItems: "center",

      borderWidth: 1,
      borderColor:
        "#eceaf7",

      shadowColor:
        "#171329",
      shadowOpacity: 0.03,
      shadowRadius: 8,
      shadowOffset: {
        width: 0,
        height: 3,
      },

      elevation: 1,
    },

    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 18,
      backgroundColor:
        "#efedff",
      alignItems: "center",
      justifyContent:
        "center",
      marginBottom: 15,
    },

    emptyTitle: {
      color: "#111827",
      fontSize: 16,
      lineHeight: 21,
      fontWeight: "900",
      textAlign: "center",
    },

    emptyText: {
      color: "#9ca3af",
      fontSize: 12,
      lineHeight: 19,
      fontWeight: "600",
      textAlign: "center",
      marginTop: 6,
      maxWidth: 250,
    },
  });
