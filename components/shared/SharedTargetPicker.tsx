import { Pressable, Text, View } from "react-native";
import { useState } from "react";
import { Field, ui } from "../profile/ProfileUI";
import { Choice, sharedStyles } from "./SharedUI";
import type { OrganizationPerson, OrganizationTeam, SharedTarget } from "../../types/shared";
import { toggleTarget } from "../../utils/sharedPermissions";
export function SharedTargetPicker({ modes, mode, onMode, teams, people, teamIds, userIds, onTeams, onUsers, disabled }: {
  modes: SharedTarget["targetType"][]; mode: SharedTarget["targetType"] | "mixed"; onMode: (value: SharedTarget["targetType"] | "mixed") => void;
  teams: OrganizationTeam[]; people: OrganizationPerson[]; teamIds: string[]; userIds: string[];
  onTeams: (values: string[]) => void; onUsers: (values: string[]) => void; disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const filtered = people.filter(row => `${row.profile?.fullName ?? ""} ${row.profile?.notivaId ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const choices: (SharedTarget["targetType"] | "mixed")[] = modes.includes("team") && modes.includes("user") ? [...modes, "mixed"] : modes;
  return <View style={ui.card}><Text style={ui.heading}>Recipients</Text><View style={sharedStyles.row}>{choices.map(value => <Choice key={value} label={value === "organization" ? "Entire Organization" : value === "team" ? "Teams" : value === "mixed" ? "Teams + Employees" : "Selected Employees"} selected={mode === value} disabled={disabled} onPress={() => onMode(value)} />)}</View>
    {mode === "organization" && <Text style={ui.subtitle}>Current members will receive this item.</Text>}
    {(mode === "team" || mode === "mixed") && <>
      <Text style={ui.subtitle}>Choose one or more teams. Overlapping recipients receive one item.</Text>
      {!teams.length && <Text style={ui.subtitle}>No active teams available.</Text>}
      {teamIds.filter(id => !teams.some(team => team.id === id)).map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel="Remove unavailable team" disabled={disabled} onPress={() => onTeams(teamIds.filter(value => value !== id))} style={ui.row}><Text style={ui.rowTitle}>Remove unavailable team</Text></Pressable>)}
      {teams.map(team => <Pressable accessibilityRole="checkbox" accessibilityLabel={team.name} accessibilityState={{ checked: teamIds.includes(team.id), disabled }} disabled={disabled} key={team.id} onPress={() => onTeams(toggleTarget(teamIds, team.id))} style={ui.row}>
        <Text style={ui.rowTitle}>{teamIds.includes(team.id) ? "☑" : "☐"} {team.name}</Text><Text style={ui.subtitle}>{team.memberCount} members</Text></Pressable>)}
    </>}
    {(mode === "user" || mode === "mixed") && <>
      <Field label="Find employees by name or Notiva ID" value={search} onChangeText={setSearch} editable={!disabled} />
      {!people.length && <Text style={ui.subtitle}>No active members available.</Text>}
      {userIds.filter(id => !people.some(person => person.userId === id)).map(id => <Pressable key={id} accessibilityRole="button" accessibilityLabel="Remove unavailable employee" disabled={disabled} onPress={() => onUsers(userIds.filter(value => value !== id))} style={ui.row}><Text style={ui.rowTitle}>Remove unavailable employee</Text></Pressable>)}
      {!!people.length && !filtered.length && <Text style={ui.subtitle}>No matching employees.</Text>}
      {filtered.map(person => <Pressable accessibilityRole="checkbox" accessibilityLabel={person.profile?.fullName ?? "Organization member"} accessibilityState={{ checked: userIds.includes(person.userId), disabled }} disabled={disabled} key={person.userId} onPress={() => onUsers(toggleTarget(userIds, person.userId))} style={ui.row}>
        <Text style={ui.rowTitle}>{userIds.includes(person.userId) ? "☑" : "☐"} {person.profile?.fullName ?? "Organization member"}</Text><Text style={ui.subtitle}>{person.profile?.notivaId}</Text></Pressable>)}
    </>}
    <Text style={ui.subtitle}>Recipients are captured when you save the audience. Future joiners are not added automatically.</Text>
  </View>;
}
