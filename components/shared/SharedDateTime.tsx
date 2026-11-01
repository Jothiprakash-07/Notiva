import { useState } from "react";
import { Platform, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Action, Field, ui } from "../profile/ProfileUI";
import { Choice, sharedStyles } from "./SharedUI";
import { formatDate, formatTime } from "../../utils/dateFormat";
export function SharedDateTime({ label, value, onChange, disabled }: { label: string; value: Date; onChange: (value: Date) => void; disabled?: boolean }) {
  const [picker, setPicker] = useState<"date" | "time">();
  const [webValue, setWebValue] = useState("");
  if (Platform.OS === "web") {
    const local = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")} ${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    return <Field label={`${label} (YYYY-MM-DD HH:mm)`} value={webValue || local} editable={!disabled} onChangeText={text => {
      setWebValue(text); onChange(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? new Date(text.replace(" ", "T")) : new Date(NaN));
    }} />;
  }
  return <View style={ui.field}><Text style={ui.label}>{label}</Text><View style={sharedStyles.row}>
    <Choice label={formatDate(value, "shortYear")} selected={picker === "date"} disabled={disabled} onPress={() => setPicker("date")} />
    <Choice label={formatTime(value)} selected={picker === "time"} disabled={disabled} onPress={() => setPicker("time")} />
  </View>{picker && <DateTimePicker value={value} mode={picker} display={Platform.OS === "ios" ? "spinner" : "default"} onChange={(event, selected) => {
    if (Platform.OS === "android") setPicker(undefined); if (!selected || event.type === "dismissed") return;
    const next = new Date(value); if (picker === "date") next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate()); else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0); onChange(next);
  }} />}{picker && Platform.OS === "ios" && <Action label="Done" secondary onPress={() => setPicker(undefined)} />}</View>;
}
