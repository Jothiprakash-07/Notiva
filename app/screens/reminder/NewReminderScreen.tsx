import { priorityColors } from "../../../constants/itemColors";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Priority = "High" | "Medium" | "Low";
type RepeatType = "None" | "Daily" | "Weekdays" | "Monthly";

const categories = [
  "Work",
  "Health",
  "Finance",
  "Personal",
  "Home",
  "Meeting",
  "Other",
];

export default function NewReminderScreen() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const [priority, setPriority] =
    useState<Priority>("Medium");

  const [repeat, setRepeat] =
    useState<RepeatType>("None");

  const [alertBefore] =
    useState("5 Minutes Before");

  const [category, setCategory] =
    useState("Work");

  const handleSave = () => {
    if (!title.trim()) {
      return;
    }

    console.log("Reminder:", {
      title,
      description,
      date: "Jun 15, 2026",
      time: "09:30 AM",
      priority,
      repeat,
      alertBefore,
      category,
    });

    router.back();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#ffffff"
      />

      {/* Header */}
      <View style={styles.header}>
        <Pressable
          style={styles.backButton}
          onPress={() => router.back()}
          hitSlop={10}
        >
          <Ionicons
            name="arrow-back"
            size={24}
            color="#111827"
          />
        </Pressable>

        <Text
          allowFontScaling={false}
          style={styles.headerTitle}
        >
          New Reminder
        </Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Title */}
        <Text
          allowFontScaling={false}
          style={styles.label}
        >
          Title
        </Text>

        <TextInput
          style={styles.input}
          placeholder="What do you need to remember?"
          placeholderTextColor="#b8b8c2"
          value={title}
          onChangeText={setTitle}
        />

        {/* Description */}
        <Text
          allowFontScaling={false}
          style={styles.label}
        >
          Description
        </Text>

        <TextInput
          style={[
            styles.input,
            styles.descriptionInput,
          ]}
          placeholder="Add a note or context..."
          placeholderTextColor="#b8b8c2"
          multiline
          textAlignVertical="top"
          maxLength={200}
          value={description}
          onChangeText={setDescription}
        />

        <Text
          allowFontScaling={false}
          style={styles.characterCount}
        >
          {description.length}/200
        </Text>

        {/* When */}
        <Text
          allowFontScaling={false}
          style={styles.sectionTitle}
        >
          When
        </Text>

        <View style={styles.whenRow}>
          <Pressable style={styles.whenCard}>
            <View style={styles.whenIconBox}>
              <Ionicons
                name="calendar-outline"
                size={22}
                color="#4d3fe6"
              />
            </View>

            <View style={styles.whenTextArea}>
              <Text
                allowFontScaling={false}
                style={styles.whenLabel}
              >
                Date
              </Text>

              <Text
                allowFontScaling={false}
                style={styles.whenValue}
              >
                Jun 15, 2026
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#6b7280"
            />
          </Pressable>

          <Pressable style={styles.whenCard}>
            <View style={styles.whenIconBox}>
              <Ionicons
                name="time-outline"
                size={23}
                color="#4d3fe6"
              />
            </View>

            <View style={styles.whenTextArea}>
              <Text
                allowFontScaling={false}
                style={styles.whenLabel}
              >
                Time
              </Text>

              <Text
                allowFontScaling={false}
                style={styles.whenValue}
              >
                09:30 AM
              </Text>
            </View>

            <Ionicons
              name="chevron-forward"
              size={18}
              color="#6b7280"
            />
          </Pressable>
        </View>

        {/* Priority */}
        <Text
          allowFontScaling={false}
          style={styles.sectionTitle}
        >
          Priority
        </Text>

        <View style={styles.priorityRow}>
          <Pressable
            style={[
              styles.priorityButton,
              styles.highButton,
              priority === "High" &&
                styles.highButtonActive,
            ]}
            onPress={() => setPriority("High")}
          >
            <Text
              allowFontScaling={false}
              style={styles.highText}
            >
              High
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.priorityButton,
              styles.mediumButton,
              priority === "Medium" &&
                styles.mediumButtonActive,
            ]}
            onPress={() =>
              setPriority("Medium")
            }
          >
            <Text
              allowFontScaling={false}
              style={styles.mediumText}
            >
              Medium
            </Text>
          </Pressable>

          <Pressable
            style={[
              styles.priorityButton,
              styles.lowButton,
              priority === "Low" &&
                styles.lowButtonActive,
            ]}
            onPress={() => setPriority("Low")}
          >
            <Text
              allowFontScaling={false}
              style={styles.lowText}
            >
              Low
            </Text>
          </Pressable>
        </View>

        {/* Repeat */}
        <Text
          allowFontScaling={false}
          style={styles.sectionTitle}
        >
          Repeat
        </Text>

        <View style={styles.repeatRow}>
          {(
            [
              "None",
              "Daily",
              "Weekdays",
              "Monthly",
            ] as RepeatType[]
          ).map((item) => {
            const active = repeat === item;

            return (
              <Pressable
                key={item}
                style={[
                  styles.repeatChip,
                  active &&
                    styles.repeatChipActive,
                ]}
                onPress={() => setRepeat(item)}
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.repeatText,
                    active &&
                      styles.repeatTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Alert */}
        <View style={styles.alertHeading}>
          <Ionicons
            name="notifications-outline"
            size={21}
            color="#4d3fe6"
          />

          <Text
            allowFontScaling={false}
            style={styles.alertHeadingText}
          >
            Alert Before Time
          </Text>
        </View>

        <Pressable style={styles.alertCard}>
          <View style={styles.alertLeft}>
            <Ionicons
              name="notifications-outline"
              size={24}
              color="#4d3fe6"
            />

            <Text
              allowFontScaling={false}
              style={styles.alertValue}
            >
              {alertBefore}
            </Text>
          </View>

          <Ionicons
            name="chevron-forward"
            size={19}
            color="#6b7280"
          />
        </Pressable>

        {/* Category */}
        <Text
          allowFontScaling={false}
          style={styles.sectionTitle}
        >
          Category
        </Text>

        <View style={styles.categoryContainer}>
          {categories.map((item) => {
            const active = category === item;

            return (
              <Pressable
                key={item}
                style={[
                  styles.categoryChip,
                  active &&
                    styles.categoryChipActive,
                ]}
                onPress={() =>
                  setCategory(item)
                }
              >
                <Text
                  allowFontScaling={false}
                  style={[
                    styles.categoryText,
                    active &&
                      styles.categoryTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Save */}
        <Pressable
          style={styles.saveButton}
          onPress={handleSave}
        >
          <Text
            allowFontScaling={false}
            style={styles.saveButtonText}
          >
            Save Reminder
          </Text>

          <Ionicons
            name="arrow-forward"
            size={20}
            color="#ffffff"
          />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#ffffff",
  },

  header: {
    height: 64,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    backgroundColor: "#ffffff",
  },

  backButton: {
    width: 40,
    height: 40,
    justifyContent: "center",
    alignItems: "flex-start",
  },

  headerTitle: {
    color: "#111827",
    fontSize: 22,
    fontWeight: "900",
    marginLeft: 2,
  },

  scrollView: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },

  label: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
    marginTop: 8,
  },

  input: {
    width: "100%",
    minHeight: 52,
    borderWidth: 1,
    borderColor: "#deddf7",
    borderRadius: 12,
    backgroundColor: "#fafaff",
    paddingHorizontal: 15,
    color: "#111827",
    fontSize: 14,
    marginBottom: 18,
  },

  descriptionInput: {
    height: 100,
    paddingTop: 14,
    paddingBottom: 14,
    marginBottom: 4,
  },

  characterCount: {
    color: "#9ca3af",
    fontSize: 11,
    textAlign: "right",
    marginBottom: 18,
  },

  sectionTitle: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
    marginTop: 8,
  },

  whenRow: {
    flexDirection: "row",
    columnGap: 10,
    marginBottom: 18,
  },

  whenCard: {
    flex: 1,
    minHeight: 72,
    borderWidth: 1,
    borderColor: "#deddf7",
    borderRadius: 14,
    backgroundColor: "#ffffff",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },

  whenIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#f0efff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },

  whenTextArea: {
    flex: 1,
  },

  whenLabel: {
    color: "#9ca3af",
    fontSize: 11,
    marginBottom: 2,
  },

  whenValue: {
    color: "#111827",
    fontSize: 12,
    fontWeight: "800",
  },

  priorityRow: {
    flexDirection: "row",
    columnGap: 10,
    marginBottom: 18,
  },

  priorityButton: {
    flex: 1,
    height: 46,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  highButton: {
    backgroundColor: priorityColors.High.backgroundColor,
  },

  highButtonActive: {
    borderWidth: 1,
    borderColor: priorityColors.High.color,
  },

  highText: {
    color: priorityColors.High.color,
    fontSize: 13,
    fontWeight: "800",
  },

  mediumButton: {
    backgroundColor: priorityColors.Medium.backgroundColor,
  },

  mediumButtonActive: {
    borderWidth: 1,
    borderColor: priorityColors.Medium.color
  },

  mediumText: {
    color: priorityColors.Medium.color,
    fontSize: 13,
    fontWeight: "800",
  },

  lowButton: {
    backgroundColor: priorityColors.Low.backgroundColor,
  },

  lowButtonActive: {
    borderWidth: 1,
    borderColor: priorityColors.Low.color,
  },

  lowText: {
    color: priorityColors.Low.color,
    fontSize: 13,
    fontWeight: "800",
  },

  repeatRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 20,
  },

  repeatChip: {
    minWidth: 72,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "#8b83ff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 13,
  },

  repeatChipActive: {
    backgroundColor: "#4d3fe6",
    borderColor: "#4d3fe6",
  },

  repeatText: {
    color: "#4d3fe6",
    fontSize: 11,
    fontWeight: "700",
  },

  repeatTextActive: {
    color: "#ffffff",
  },

  alertHeading: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 8,
    marginBottom: 10,
  },

  alertHeadingText: {
    color: "#111827",
    fontSize: 15,
    fontWeight: "700",
  },

  alertCard: {
    minHeight: 58,
    borderRadius: 14,
    backgroundColor: "#f7f6ff",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginBottom: 22,
  },

  alertLeft: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 12,
  },

  alertValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },

  categoryContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 26,
  },

  categoryChip: {
    minWidth: "29%",
    height: 40,
    borderRadius: 20,
    backgroundColor: "#e8e7ff",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
  },

  categoryChipActive: {
    backgroundColor: "#4d3fe6",
  },

  categoryText: {
    color: "#4d3fe6",
    fontSize: 11,
    fontWeight: "700",
  },

  categoryTextActive: {
    color: "#ffffff",
  },

  saveButton: {
    width: "100%",
    height: 54,
    borderRadius: 10,
    backgroundColor: "#4d3fe6",
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    columnGap: 10,
    marginTop: 4,
  },

  saveButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
});