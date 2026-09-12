import CompletionNoteModal from "../common/CompletionNoteModal";
import { useRef, useState } from "react";
import { Alert, Animated, PanResponder, StyleSheet, Text, View } from "react-native";

import { ItemStatus, ItemType, Priority } from "../../types/item";
import ReminderCard from "./ReminderCard";

type Props = {
  id: string;
  priority?: Priority;
  title: string;
  time: string;
  date: string;
  category: string;
  status: ItemStatus;
  type: ItemType;
  onPress: () => void;
  onDone: (completionNote?: string) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
  onReschedule: () => void;
};

const SWIPE_THRESHOLD = 72;

export default function ActionRequiredCard(props: Props) {
  const [showCompletion, setShowCompletion] = useState(false);
  const latest = useRef(props);
  latest.current = props;
  const translateX = useRef(new Animated.Value(0)).current;
  const reset = () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  const confirmDone = () => {
    reset();
    const current = latest.current;
    if ((current.type === "reminder" || current.type === "task") && ["Pending", "Missed", "Overdue"].includes(current.status)) setShowCompletion(true);
  };
  const chooseAction = () => {
    reset();
    Alert.alert("Action Required", props.title, [
      { text: "Reschedule", onPress: props.onReschedule },
      { text: "Skip", onPress: () => { void props.onSkip(); } },
      { text: "Cancel", style: "cancel" },
    ]);
  };
  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
    onPanResponderMove: (_, gesture) => translateX.setValue(Math.max(-120, Math.min(120, gesture.dx))),
    onPanResponderRelease: (_, gesture) => {
      if (gesture.dx >= SWIPE_THRESHOLD) confirmDone();
      else if (gesture.dx <= -SWIPE_THRESHOLD) chooseAction();
      else reset();
    },
    onPanResponderTerminate: reset,
  })).current;

  return (
    <View style={styles.container}>
      <View style={styles.actions} pointerEvents="none">
        <Text style={[styles.actionText, styles.doneText]}>Mark Done</Text>
        <Text style={[styles.actionText, styles.rescheduleText]}>Actions</Text>
      </View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }] }}>
        <ReminderCard {...props} onToggle={undefined} />
      </Animated.View>
      <CompletionNoteModal visible={showCompletion} itemTitle={props.title} onClose={() => setShowCompletion(false)}
        onConfirm={async note => { await latest.current.onDone(note); setShowCompletion(false); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative" },
  actions: {
    ...StyleSheet.absoluteFillObject,
    height: 88,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    borderRadius: 8,
    backgroundColor: "#ede9fe",
  },
  actionText: { fontSize: 12, fontWeight: "900" },
  doneText: { color: "#15803d" },
  rescheduleText: { color: "#4d3fe6" },
});
