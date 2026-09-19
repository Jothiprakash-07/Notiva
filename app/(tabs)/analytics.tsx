import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";

import { getItems } from "../../services/itemStorage";
import { getAppSettings, useAppSettings } from "../../services/appSettings";
import type { ItemType, ReminderItem } from "../../types/item";
import {
  calculateAnalytics,
  type AnalyticsPeriod,
} from "../../utils/itemAnalytics";

const PURPLE = "#4D3FE6";
const BG = "#F7F7FC";
const TEXT = "#171329";
const MUTED = "#797487";
const BORDER = "#ECEAF4";

const periods: { label: string; value: AnalyticsPeriod }[] = [
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
  { label: "All Time", value: "all" },
];

const typeRows: {
  type: ItemType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  soft: string;
}[] = [
  {
    type: "reminder",
    label: "Reminder",
    icon: "alarm-outline",
    color: PURPLE,
    soft: "#EEECFF",
  },
  {
    type: "task",
    label: "Task",
    icon: "checkmark-done-outline",
    color: "#268579",
    soft: "#E9F6F2",
  },
  {
    type: "event",
    label: "Event",
    icon: "calendar-outline",
    color: "#5680D7",
    soft: "#EDF3FF",
  },
  {
    type: "birthday",
    label: "Birthday",
    icon: "gift-outline",
    color: "#B15B9C",
    soft: "#F8EDF5",
  },
];

export default function AnalyticsScreen() {
  const appSettings = useAppSettings();
  const [items, setItems] = useState<ReminderItem[]>([]);
  const [period, setPeriod] = useState<AnalyticsPeriod>("week");
  const [now, setNow] = useState(() => new Date());

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let request = 0;

      if (revision > 0) {
        setLoading(true);
      }

      const refresh = async () => {
        const current = ++request;

        try {
          const [stored] = await Promise.all([getItems(), getAppSettings()]);

          if (active && request === current) {
            setItems(stored);
            setNow(new Date());
            setError(false);
          }
        } catch {
          if (active && request === current) {
            setError(true);
          }
        } finally {
          if (active && request === current) {
            setLoading(false);
          }
        }
      };

      void refresh();

      const subscription = AppState.addEventListener(
        "change",
        state => {
          if (state === "active") {
            void refresh();
          }
        },
      );

      const timer = setInterval(() => {
        setNow(new Date());
      }, 30_000);

      return () => {
        active = false;
        subscription.remove();
        clearInterval(timer);
      };
    }, [revision]),
  );

  const analytics = useMemo(
    () => calculateAnalytics(items, period, now, appSettings.weekStartsOn),
    [items, period, now, appSettings.weekStartsOn],
  );

  const segments = [
    {
      label: "Completed",
      value: analytics.completed,
      color: "#18864B",
    },
    {
      label: "Pending",
      value: analytics.pending,
      color: "#E89A27",
    },
    {
      label: "Missed / Overdue",
      value: analytics.missed,
      color: "#DF5050",
    },
  ];

  const summaryCards = [
    {
      label: "Total",
      filter: "all",
      value: analytics.total,
      icon: "layers-outline" as const,
      color: PURPLE,
      soft: "#EFEDFF",
    },
    {
      label: "Completed",
      filter: "done",
      value: analytics.completed,
      icon: "checkmark-circle-outline" as const,
      color: "#18864B",
      soft: "#EAF7EF",
    },
    {
      label: "Pending",
      filter: "pending",
      value: analytics.pending,
      icon: "time-outline" as const,
      color: "#D88614",
      soft: "#FFF4DF",
    },
    {
      label: "Missed",
      filter: "overdue",
      value: analytics.missed,
      icon: "alert-circle-outline" as const,
      color: "#D74545",
      soft: "#FDECEC",
    },
  ];

  const circumference = 2 * Math.PI * 62;

  let donutOffset = 0;

  const maxActivity = Math.max(
    1,
    ...analytics.days.map(day => day.count),
  );

  const currentDayIndex = (now.getDay() - appSettings.weekStartsOn + 7) % 7;

  return (
    <SafeAreaView
      style={styles.safeArea}
      edges={["top", "left", "right"]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Analytics</Text>

          <Text style={styles.subtitle}>
            Your activity at a glance
          </Text>
        </View>

        <View style={styles.headerIcon}>
          <Ionicons
            name="analytics-outline"
            size={22}
            color="#FFFFFF"
          />
        </View>
      </View>

      <View style={styles.body}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.content}
        >
          {/* Period Filter */}
          <View style={styles.selector}>
            {periods.map(option => {
              const selected = period === option.value;

              return (
                <Pressable
                  key={option.value}
                  onPress={() => setPeriod(option.value)}
                  style={[
                    styles.periodButton,
                    selected &&
                      styles.periodButtonActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodText,
                      selected &&
                        styles.periodTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.state}>
              <ActivityIndicator
                size="large"
                color={PURPLE}
              />

              <Text style={styles.stateText}>
                Loading analytics...
              </Text>
            </View>
          ) : error ? (
            <View style={styles.state}>
              <View style={styles.stateIconError}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={30}
                  color="#D74545"
                />
              </View>

              <Text style={styles.stateTitle}>
                Could not load analytics
              </Text>

              <Pressable
                style={styles.retryButton}
                onPress={() =>
                  setRevision(value => value + 1)
                }
              >
                <Text style={styles.retryText}>
                  Try Again
                </Text>
              </Pressable>
            </View>
          ) : !items.length ? (
            <View style={styles.state}>
              <View style={styles.stateIcon}>
                <Ionicons
                  name="analytics-outline"
                  size={32}
                  color={PURPLE}
                />
              </View>

              <Text style={styles.stateTitle}>
                No activity yet
              </Text>

              <Text style={styles.stateText}>
                Create reminders, tasks, or events to
                see your analytics.
              </Text>
            </View>
          ) : (
            <>
              {/* =========================
                  SUMMARY CARDS
              ========================== */}
              <View style={styles.summaryGrid}>
                {summaryCards.map(card => (
                  <Pressable
                    key={card.label}
                    accessibilityRole="button"
                    accessibilityLabel={`${card.label}: ${card.value}. View ${card.filter} items`}
                    onPress={() =>
                      router.push({
                        pathname:
                          "/(tabs)/reminders",
                        params: {
                          filter: card.filter,
                        },
                      })
                    }
                    style={({ pressed }) => [
                      styles.summaryCard,
                      pressed &&
                        styles.summaryCardPressed,
                    ]}
                  >
                    {/* Left Icon */}
                    <View
                      style={[
                        styles.summaryIcon,
                        {
                          backgroundColor: card.soft,
                        },
                      ]}
                    >
                      <Ionicons
                        name={card.icon}
                        size={18}
                        color={card.color}
                      />
                    </View>

                    {/* Number + Label */}
                    <View style={styles.summaryContent}>
                      <Text style={styles.summaryValue}>
                        {card.value}
                      </Text>

                      <Text style={styles.summaryLabel}>
                        {card.label}
                      </Text>
                    </View>

                    {/* Arrow - RIGHT CENTER */}
                    <View style={styles.summaryArrow}>
                      <Ionicons
                        name="chevron-forward"
                        size={16}
                        color="#AAA5B4"
                      />
                    </View>
                  </Pressable>
                ))}
              </View>

              {!analytics.total && (
                <View style={styles.notice}>
                  <Ionicons
                    name="information-circle-outline"
                    size={17}
                    color={PURPLE}
                  />

                  <Text style={styles.noticeText}>
                    No items in this period. Try All
                    Time.
                  </Text>
                </View>
              )}

              {/* =========================
                  COMPLETION OVERVIEW
              ========================== */}
              <View style={styles.card}>
                <View style={styles.cardAccent} />

                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Completion Overview
                    </Text>

                    <Text
                      style={styles.sectionSubtitle}
                    >
                      Actionable item progress
                    </Text>
                  </View>

                  <View style={styles.sectionIcon}>
                    <Ionicons
                      name="pie-chart-outline"
                      size={18}
                      color={PURPLE}
                    />
                  </View>
                </View>

                <View style={styles.overview}>
                  {/* Donut */}
                  <View style={styles.donut}>
                    <Svg
                      width={166}
                      height={166}
                      viewBox="0 0 166 166"
                    >
                      <Circle
                        cx={83}
                        cy={83}
                        r={62}
                        stroke="#EFEFF6"
                        strokeWidth={15}
                        fill="none"
                      />

                      {segments.map(segment => {
                        const length =
                          analytics.actionable > 0
                            ? (segment.value /
                                analytics.actionable) *
                              circumference
                            : 0;

                        const start = donutOffset;

                        donutOffset += length;

                        if (length <= 0) {
                          return null;
                        }

                        return (
                          <Circle
                            key={segment.label}
                            cx={83}
                            cy={83}
                            r={62}
                            fill="none"
                            stroke={segment.color}
                            strokeWidth={15}
                            strokeLinecap="round"
                            strokeDasharray={[
                              Math.max(
                                length - 3,
                                0,
                              ),
                              circumference -
                                Math.max(
                                  length - 3,
                                  0,
                                ),
                            ]}
                            strokeDashoffset={-start}
                            rotation={-90}
                            origin="83, 83"
                          />
                        );
                      })}
                    </Svg>

                    <View
                      style={styles.donutCenter}
                      pointerEvents="none"
                    >
                      <Text style={styles.percentage}>
                        {analytics.percentage}%
                      </Text>

                      <Text
                        style={
                          styles.percentageLabel
                        }
                      >
                        Completion rate
                      </Text>

                      <Text
                        style={
                          styles.actionableText
                        }
                      >
                        {analytics.actionable} items
                      </Text>
                    </View>
                  </View>

                  {/* Legend */}
                  <View style={styles.legend}>
                    {segments.map(segment => (
                      <View
                        key={segment.label}
                        style={styles.legendRow}
                      >
                        <View
                          style={[
                            styles.legendDot,
                            {
                              backgroundColor:
                                segment.color,
                            },
                          ]}
                        />

                        <Text
                          style={styles.legendLabel}
                        >
                          {segment.label}
                        </Text>

                        <View
                          style={styles.legendBadge}
                        >
                          <Text
                            style={
                              styles.legendBadgeText
                            }
                          >
                            {segment.value}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </View>

              {/* =========================
                  TYPE BREAKDOWN
              ========================== */}
              <View style={styles.card}>
                <View style={styles.cardAccent} />

                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Type Breakdown
                    </Text>

                    <Text
                      style={styles.sectionSubtitle}
                    >
                      Saved items by type
                    </Text>
                  </View>

                  <View style={styles.totalBadge}>
                    <Text
                      style={styles.totalBadgeText}
                    >
                      {analytics.total} total
                    </Text>
                  </View>
                </View>

                <View style={styles.typeList}>
                  {typeRows.map(row => {
                    const count =
                      analytics.types[row.type];

                    const percentage =
                      analytics.total > 0
                        ? (count /
                            analytics.total) *
                          100
                        : 0;

                    return (
                      <View
                        key={row.type}
                        style={styles.typeRow}
                      >
                        <View style={styles.typeTop}>
                          <View
                            style={
                              styles.typeIdentity
                            }
                          >
                            <View
                              style={[
                                styles.typeIcon,
                                {
                                  backgroundColor:
                                    row.soft,
                                },
                              ]}
                            >
                              <Ionicons
                                name={row.icon}
                                size={18}
                                color={row.color}
                              />
                            </View>

                            <View>
                              <Text
                                style={
                                  styles.typeLabel
                                }
                              >
                                {row.label}
                              </Text>

                              <Text
                                style={
                                  styles.typePercentage
                                }
                              >
                                {Math.round(
                                  percentage,
                                )}
                                %
                              </Text>
                            </View>
                          </View>

                          <View
                            style={styles.countBadge}
                          >
                            <Text
                              style={
                                styles.countBadgeText
                              }
                            >
                              {count}
                            </Text>
                          </View>
                        </View>

                        <View
                          style={
                            styles.progressTrack
                          }
                        >
                          <View
                            style={[
                              styles.progressFill,
                              {
                                width: `${percentage}%`,
                                backgroundColor:
                                  row.color,
                              },
                            ]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* =========================
                  WEEKLY ACTIVITY
              ========================== */}
              <View style={styles.card}>
                <View style={styles.cardAccent} />

                <View style={styles.sectionHeader}>
                  <View>
                    <Text style={styles.sectionTitle}>
                      Weekly Activity
                    </Text>

                    <Text
                      style={styles.sectionSubtitle}
                    >
                      Completed items · {appSettings.weekStartsOn === 1 ? "Mon–Sun" : "Sun–Sat"}
                    </Text>
                  </View>

                  <View style={styles.sectionIcon}>
                    <Ionicons
                      name="bar-chart-outline"
                      size={18}
                      color={PURPLE}
                    />
                  </View>
                </View>

                <View style={styles.chartArea}>
                  {analytics.days.map(
                    (day, index) => {
                      const isToday =
                        index ===
                        currentDayIndex;

                      const height =
                        day.count > 0
                          ? Math.max(
                              12,
                              (day.count /
                                maxActivity) *
                                100,
                            )
                          : 0;

                      return (
                        <View
                          key={day.label}
                          style={styles.barColumn}
                        >
                          <Text
                            style={[
                              styles.barCount,
                              isToday &&
                                styles.barCountToday,
                            ]}
                          >
                            {day.count}
                          </Text>

                          <View
                            style={[
                              styles.barTrack,
                              isToday &&
                                styles.barTrackToday,
                            ]}
                          >
                            <View
                              style={[
                                styles.bar,
                                {
                                  height: `${height}%`,
                                  opacity:
                                    isToday
                                      ? 1
                                      : 0.72,
                                },
                              ]}
                            />
                          </View>

                          <View
                            style={[
                              styles.dayBubble,
                              isToday &&
                                styles.dayBubbleToday,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                isToday &&
                                  styles.dayTextToday,
                              ]}
                            >
                              {day.label}
                            </Text>
                          </View>
                        </View>
                      );
                    },
                  )}
                </View>

                <View style={styles.infoRow}>
                  <Ionicons
                    name="information-circle-outline"
                    size={14}
                    color={MUTED}
                  />

                  <Text style={styles.infoRowText}>
                    Current day is highlighted.
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: PURPLE,
  },

  header: {
    minHeight: 108,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },

  title: {
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },

  subtitle: {
    marginTop: 3,
    fontSize: 12,
    color: "#DCD9FF",
  },

  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },

  body: {
    flex: 1,
    backgroundColor: BG,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    overflow: "hidden",
  },

  content: {
    width: "100%",
    maxWidth: 720,
    alignSelf: "center",
    padding: 16,
    paddingBottom: 40,
    gap: 15,
  },

  selector: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 15,
    backgroundColor: "#ECEBF4",
  },

  periodButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },

  periodButtonActive: {
    backgroundColor: "#FFFFFF",
    elevation: 2,
  },

  periodText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#858091",
  },

  periodTextActive: {
    color: PURPLE,
    fontWeight: "900",
  },

  /* =========================
     SUMMARY CARDS
  ========================== */

  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },

  summaryCard: {
    position: "relative",

    flexBasis: "47%",
    flexGrow: 1,

    minHeight: 88,

    paddingLeft: 13,
    paddingRight: 34,
    paddingVertical: 13,

    borderRadius: 18,

    flexDirection: "row",
    alignItems: "center",

    gap: 11,

    backgroundColor: "#FFFFFF",

    borderWidth: 1,
    borderColor: BORDER,

    elevation: 2,
  },

  summaryCardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.985 }],
  },

  summaryIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",
  },

  summaryContent: {
    flex: 1,
    justifyContent: "center",
  },

  summaryValue: {
    fontSize: 24,
    lineHeight: 28,

    fontWeight: "900",

    color: TEXT,
  },

  summaryLabel: {
    marginTop: 2,

    fontSize: 11,
    lineHeight: 15,

    color: MUTED,

    fontWeight: "600",
  },

  /*
   * Arrow stays on the right side,
   * but is vertically centered inside the card.
   */
  summaryArrow: {
    position: "absolute",

    right: 10,

    top: 0,
    bottom: 0,

    alignItems: "center",
    justifyContent: "center",
  },

  notice: {
    padding: 12,

    borderRadius: 14,

    flexDirection: "row",
    alignItems: "center",

    gap: 7,

    backgroundColor: "#EFEDFF",
  },

  noticeText: {
    flex: 1,

    fontSize: 11,

    color: "#645D91",
  },

  /* =========================
     COMMON CARD
  ========================== */

  card: {
    position: "relative",

    padding: 18,

    borderRadius: 22,

    gap: 18,

    overflow: "hidden",

    backgroundColor: "#FFFFFF",

    borderWidth: 1,
    borderColor: BORDER,

    elevation: 2,
  },

  cardAccent: {
    position: "absolute",

    top: 0,
    left: 18,
    right: 18,

    height: 3,

    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,

    backgroundColor: PURPLE,

    opacity: 0.75,
  },

  sectionHeader: {
    flexDirection: "row",

    alignItems: "center",
    justifyContent: "space-between",

    gap: 12,
  },

  sectionTitle: {
    fontSize: 17,

    fontWeight: "900",

    color: TEXT,
  },

  sectionSubtitle: {
    marginTop: 3,

    fontSize: 11,

    color: MUTED,
  },

  sectionIcon: {
    width: 36,
    height: 36,

    borderRadius: 12,

    backgroundColor: "#EFEDFF",

    alignItems: "center",
    justifyContent: "center",
  },

  /* =========================
     COMPLETION
  ========================== */

  overview: {
    flexDirection: "row",

    flexWrap: "wrap",

    alignItems: "center",
    justifyContent: "center",

    gap: 22,
  },

  donut: {
    width: 166,
    height: 166,
  },

  donutCenter: {
    ...StyleSheet.absoluteFillObject,

    alignItems: "center",
    justifyContent: "center",
  },

  percentage: {
    fontSize: 30,

    fontWeight: "900",

    color: TEXT,
  },

  percentageLabel: {
    marginTop: 1,

    fontSize: 10,

    fontWeight: "700",

    color: MUTED,
  },

  actionableText: {
    marginTop: 3,

    fontSize: 9,

    color: "#A09BAB",
  },

  legend: {
    minWidth: 160,

    flexGrow: 1,

    gap: 13,
  },

  legendRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 8,
  },

  legendDot: {
    width: 9,
    height: 9,

    borderRadius: 5,
  },

  legendLabel: {
    flex: 1,

    fontSize: 12,

    color: "#5B5667",
  },

  legendBadge: {
    minWidth: 30,

    paddingVertical: 5,
    paddingHorizontal: 8,

    borderRadius: 10,

    backgroundColor: "#F3F2F7",

    alignItems: "center",
  },

  legendBadgeText: {
    fontSize: 11,

    fontWeight: "900",

    color: TEXT,
  },

  /* =========================
     TYPE BREAKDOWN
  ========================== */

  totalBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,

    borderRadius: 12,

    backgroundColor: "#F3F2F7",
  },

  totalBadgeText: {
    fontSize: 10,

    fontWeight: "800",

    color: "#656070",
  },

  typeList: {
    gap: 18,
  },

  typeRow: {
    gap: 8,
  },

  typeTop: {
    flexDirection: "row",

    alignItems: "center",
    justifyContent: "space-between",
  },

  typeIdentity: {
    flexDirection: "row",

    alignItems: "center",

    gap: 10,
  },

  typeIcon: {
    width: 38,
    height: 38,

    borderRadius: 12,

    alignItems: "center",
    justifyContent: "center",
  },

  typeLabel: {
    fontSize: 13,

    fontWeight: "800",

    color: TEXT,
  },

  typePercentage: {
    marginTop: 2,

    fontSize: 10,

    color: MUTED,
  },

  countBadge: {
    minWidth: 34,
    height: 30,

    paddingHorizontal: 9,

    borderRadius: 10,

    backgroundColor: "#F3F2F7",

    alignItems: "center",
    justifyContent: "center",
  },

  countBadgeText: {
    fontSize: 13,

    fontWeight: "900",

    color: TEXT,
  },

  progressTrack: {
    height: 7,

    marginLeft: 48,

    overflow: "hidden",

    borderRadius: 5,

    backgroundColor: "#EFEFF4",
  },

  progressFill: {
    height: "100%",

    borderRadius: 5,
  },

  /* =========================
     WEEKLY CHART
  ========================== */

  chartArea: {
    height: 165,

    flexDirection: "row",

    alignItems: "flex-end",

    gap: 7,
  },

  barColumn: {
    flex: 1,

    height: "100%",

    alignItems: "center",
    justifyContent: "flex-end",

    gap: 7,
  },

  barCount: {
    fontSize: 10,

    fontWeight: "800",

    color: "#777184",
  },

  barCountToday: {
    color: PURPLE,
  },

  barTrack: {
    width: "100%",

    maxWidth: 30,

    height: 112,

    justifyContent: "flex-end",

    borderRadius: 8,

    overflow: "hidden",

    backgroundColor: "#F0EEFC",
  },

  barTrackToday: {
    backgroundColor: "#E7E3FF",
  },

  bar: {
    width: "100%",

    borderRadius: 8,

    backgroundColor: PURPLE,
  },

  dayBubble: {
    minWidth: 30,
    height: 24,

    paddingHorizontal: 5,

    borderRadius: 8,

    alignItems: "center",
    justifyContent: "center",
  },

  dayBubbleToday: {
    backgroundColor: PURPLE,
  },

  dayText: {
    fontSize: 10,

    fontWeight: "700",

    color: MUTED,
  },

  dayTextToday: {
    color: "#FFFFFF",
  },

  infoRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: 5,
  },

  infoRowText: {
    fontSize: 10,

    color: MUTED,
  },

  /* =========================
     STATES
  ========================== */

  state: {
    minHeight: 320,

    alignItems: "center",
    justifyContent: "center",

    paddingHorizontal: 24,
  },

  stateIcon: {
    width: 70,
    height: 70,

    marginBottom: 16,

    borderRadius: 23,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#EEECFF",
  },

  stateIconError: {
    width: 70,
    height: 70,

    marginBottom: 16,

    borderRadius: 23,

    alignItems: "center",
    justifyContent: "center",

    backgroundColor: "#FDECEC",
  },

  stateTitle: {
    fontSize: 18,

    fontWeight: "900",

    color: TEXT,

    textAlign: "center",
  },

  stateText: {
    marginTop: 7,

    maxWidth: 290,

    fontSize: 12,
    lineHeight: 19,

    color: MUTED,

    textAlign: "center",
  },

  retryButton: {
    marginTop: 16,

    minHeight: 42,

    paddingHorizontal: 18,

    borderRadius: 12,

    backgroundColor: PURPLE,

    alignItems: "center",
    justifyContent: "center",
  },

  retryText: {
    fontSize: 12,

    fontWeight: "800",

    color: "#FFFFFF",
  },
});
