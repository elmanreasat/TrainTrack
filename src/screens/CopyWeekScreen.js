import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  SafeAreaView,
  FlatList,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listWeeks, copyWeekExercises } from "../db/db";

export default function CopyWeekScreen({ route, navigation }) {
  const { templateId, templateName } = route.params;
  const [weeks, setWeeks] = useState([]);
  const [sourceWeek, setSourceWeek] = useState(null);
  const [targets, setTargets] = useState(new Set());
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const w = await listWeeks(templateId);
    setWeeks(w);
    if (w.length && sourceWeek == null) setSourceWeek(w[0].week);
  }, [templateId, sourceWeek]);

  useEffect(() => {
    navigation.setOptions({
      title: templateName ? `Copy (${templateName})` : "Copy Week",
    });
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation, load, templateName]);

  const toggleTarget = (week) => {
    const next = new Set(targets);
    if (next.has(week)) next.delete(week);
    else next.add(week);
    setTargets(next);
  };

  const selectAllTargets = () => {
    const all = new Set(
      weeks.map((w) => w.week).filter((w) => w !== sourceWeek)
    );
    setTargets(all);
  };

  const clearTargets = () => setTargets(new Set());

  const onCopy = async () => {
    if (!sourceWeek) {
      Alert.alert("Select source week", "Please choose a source week.");
      return;
    }
    const dests = Array.from(targets).filter((w) => w !== sourceWeek);
    if (dests.length === 0) {
      Alert.alert(
        "Select destination weeks",
        "Choose at least one destination week."
      );
      return;
    }
    setBusy(true);
    try {
      await copyWeekExercises(templateId, sourceWeek, dests);
      Alert.alert(
        "Copied",
        `Week ${sourceWeek} copied to: ${dests.join(", ")}`
      );
      navigation.goBack();
    } catch (e) {
      Alert.alert("Copy failed", e?.message || "Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const renderWeekRow = ({ item }) => {
    const w = item.week;
    const isSource = w === sourceWeek;
    const isTarget = targets.has(w);
    return (
      <View style={styles.weekRow}>
        <TouchableOpacity
          style={styles.radio}
          onPress={() => {
            setSourceWeek(w);
            // remove from targets if it was selected
            if (targets.has(w)) {
              const next = new Set(targets);
              next.delete(w);
              setTargets(next);
            }
          }}
          accessibilityLabel={`Set week ${w} as source`}
        >
          {isSource ? (
            <Ionicons name="radio-button-on" size={22} color="#000" />
          ) : (
            <Ionicons name="radio-button-off" size={22} color="#bbb" />
          )}
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.weekLabel}>{`Week ${w}`}</Text>
        </View>
        <TouchableOpacity
          onPress={() => toggleTarget(w)}
          disabled={isSource}
          style={[
            styles.checkboxPill,
            isTarget && styles.checkboxPillOn,
            isSource && styles.checkboxDisabled,
          ]}
          accessibilityLabel={
            isTarget ? `Unselect week ${w}` : `Select week ${w}`
          }
        >
          {isTarget ? (
            <Ionicons name="checkbox" size={20} color="#000" />
          ) : (
            <Ionicons
              name="square-outline"
              size={20}
              color={isSource ? "#ddd" : "#999"}
            />
          )}
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.header}>Select source and destination weeks</Text>
        <View style={styles.legendRow}>
          <Text style={styles.legendText}>Left: Source (radio)</Text>
          <Text style={styles.legendText}>Right: Targets (multiple)</Text>
        </View>
        <FlatList
          data={weeks}
          keyExtractor={(i) => String(i.week)}
          renderItem={renderWeekRow}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={selectAllTargets}>
            <Text style={styles.actionText}>Select all</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={clearTargets}>
            <Text style={styles.actionText}>Clear</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        onPress={onCopy}
        disabled={busy}
        style={[styles.copyFab, busy && { opacity: 0.6 }]}
        activeOpacity={0.85}
      >
        <Text style={styles.copyFabText}>{busy ? "Copying..." : "Copy"}</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f7f7f7" },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  header: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  legendRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  legendText: { color: "#666", fontSize: 12 },
  weekRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  weekLabel: { fontSize: 14, fontWeight: "600" },
  sep: { height: 1, backgroundColor: "#f0f0f0" },
  radio: { marginRight: 12 },
  checkboxPill: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "#f2f2f2",
  },
  checkboxPillOn: { backgroundColor: "#e8e8e8" },
  checkboxDisabled: { backgroundColor: "#fafafa" },
  actionsRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 8,
  },
  actionBtn: {
    backgroundColor: "#000",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  actionText: { color: "#fff", fontWeight: "600" },
  copyFab: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    elevation: 3,
  },
  copyFabText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
