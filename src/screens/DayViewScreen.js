import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Swipeable } from "react-native-gesture-handler";
// Removed reanimated list animations to stop bounce on refresh
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  getExercises,
  deleteExercise,
  updateExerciseWithSets,
  getDayCompleted,
  setDayCompleted,
} from "../db/db";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const ExerciseCard = React.memo(function ExerciseCard({
  exercise,
  onSave,
  isSelectMode,
  isSelected,
  onToggleSelect,
}) {
  const [name, setName] = React.useState(exercise.name || "");
  const [notes, setNotes] = React.useState(exercise.notes || "");
  const [setRows, setSetRows] = React.useState(
    exercise.setRows && exercise.setRows.length
      ? exercise.setRows.map((r) => ({
          reps: r.reps != null ? String(r.reps) : "",
          weight: r.weight != null ? String(r.weight) : "",
        }))
      : [
          {
            reps: exercise.reps != null ? String(exercise.reps) : "",
            weight: exercise.weight != null ? String(exercise.weight) : "",
          },
        ]
  );
  const saveTimer = React.useRef(null);
  const lastSnapshotRef = React.useRef(null);

  // If the exercise id changes (shouldn't often), reset local state
  React.useEffect(() => {
    setName(exercise.name || "");
    setNotes(exercise.notes || "");
    if (exercise.setRows && exercise.setRows.length) {
      setSetRows(
        exercise.setRows.map((r) => ({
          reps: r.reps != null ? String(r.reps) : "",
          weight: r.weight != null ? String(r.weight) : "",
        }))
      );
    }
    lastSnapshotRef.current = null; // force re-eval
  }, [exercise.id]);

  const vol = setRows.reduce(
    (sum, r) => sum + (Number(r.reps) || 0) * (Number(r.weight) || 0),
    0
  );

  // Deep compare current form values with original exercise + last saved snapshot
  React.useEffect(() => {
    if (isSelectMode) return; // no saving while selecting
    const currentSnapshot = JSON.stringify({
      name: name.trim(),
      notes: notes || null,
      rows: setRows.map((r) => [
        r.reps === "" ? null : Number(r.reps),
        r.weight === "" ? null : Number(r.weight),
      ]),
    });
    if (lastSnapshotRef.current === currentSnapshot) return; // nothing changed since last scheduled save

    // Compare with exercise prop (initial) to avoid immediate save if unchanged
    const propRows = (
      exercise.setRows && exercise.setRows.length
        ? exercise.setRows
        : exercise.sets
        ? Array.from({ length: exercise.sets }, () => ({
            reps: exercise.reps,
            weight: exercise.weight,
          }))
        : []
    ).map((r) => [
      r.reps == null ? null : Number(r.reps),
      r.weight == null ? null : Number(r.weight),
    ]);
    const curRows = setRows.map((r) => [
      r.reps === "" ? null : Number(r.reps),
      r.weight === "" ? null : Number(r.weight),
    ]);
    const equalRows =
      propRows.length === curRows.length &&
      propRows.every(
        (r, i) => r[0] === curRows[i][0] && r[1] === curRows[i][1]
      );
    const unchanged =
      (exercise.name || "").trim() === name.trim() &&
      (exercise.notes || null) === (notes || null) &&
      equalRows;
    if (unchanged && lastSnapshotRef.current == null) {
      // first run and nothing changed -> don't schedule save
      lastSnapshotRef.current = currentSnapshot; // mark baseline to avoid re-evaluating
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      lastSnapshotRef.current = currentSnapshot;
      const cleaned = setRows.map((r) => ({
        reps: r.reps === "" ? null : Number(r.reps),
        weight: r.weight === "" ? null : Number(r.weight),
      }));
      onSave({ id: exercise.id, name, notes, setRows: cleaned });
    }, 700);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [
    name,
    notes,
    setRows,
    isSelectMode,
    exercise.id,
    exercise.name,
    exercise.notes,
    exercise.setRows,
    exercise.sets,
    exercise.reps,
    exercise.weight,
    onSave,
  ]);

  const updateRow = (index, patch) => {
    setSetRows((rows) => {
      const next = rows.slice();
      next[index] = { ...next[index], ...patch };
      return next;
    });
  };

  const addRow = () => {
    setSetRows((rows) => [...rows, { reps: "", weight: "" }]);
  };

  const removeRow = (index) => {
    setSetRows((rows) =>
      rows.length === 1 ? rows : rows.filter((_, i) => i !== index)
    );
  };

  return (
    <View style={styles.card}>
      {isSelectMode && (
        <TouchableOpacity
          onPress={onToggleSelect}
          style={{ paddingRight: 6 }}
          accessibilityRole="button"
          accessibilityLabel={
            isSelected ? "Deselect exercise" : "Select exercise"
          }
        >
          <Ionicons
            name={isSelected ? "checkbox-outline" : "square-outline"}
            size={22}
            color={isSelected ? "#0a84ff" : "#999"}
          />
        </TouchableOpacity>
      )}
      <View style={{ flex: 1, gap: 6 }}>
        <Text style={styles.title}>Exercise</Text>
        <View style={styles.row}>
          <View style={[styles.field, { flex: 2 }]}>
            <Text style={styles.fieldLabel}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Bench Press"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
            />
          </View>
        </View>
        <View style={{ gap: 6 }}>
          <Text style={styles.fieldLabel}>Sets</Text>
          <View style={styles.setsHeaderRow}>
            <Text style={styles.setsHeaderIndex}></Text>
            <Text style={styles.setsHeaderLabel}>Reps</Text>
            <Text style={styles.setsHeaderLabel}>Weight</Text>
            <Text style={styles.setsHeaderSpacer}></Text>
          </View>
          {setRows.map((row, idx) => (
            <View key={idx} style={[styles.row, { alignItems: "center" }]}>
              <Text style={{ width: 20, fontSize: 12, color: "#666" }}>
                {idx + 1}
              </Text>
              <TextInput
                style={[styles.input, styles.num, { flex: 1 }]}
                placeholder="Reps"
                keyboardType="number-pad"
                placeholderTextColor="#999"
                value={row.reps}
                onChangeText={(v) => updateRow(idx, { reps: v })}
              />
              <TextInput
                style={[styles.input, styles.num, { flex: 1 }]}
                placeholder="Weight"
                keyboardType="decimal-pad"
                placeholderTextColor="#999"
                value={row.weight}
                onChangeText={(v) => updateRow(idx, { weight: v })}
              />
              <TouchableOpacity
                onPress={() => removeRow(idx)}
                style={{ padding: 6 }}
                disabled={setRows.length === 1}
              >
                <Ionicons
                  name={
                    setRows.length === 1
                      ? "remove-circle-outline"
                      : "remove-circle"
                  }
                  size={20}
                  color={setRows.length === 1 ? "#ccc" : "#d11a2a"}
                />
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity
            onPress={addRow}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 4,
            }}
          >
            <Ionicons name="add-circle-outline" size={20} color="#0a84ff" />
            <Text style={{ color: "#0a84ff", fontWeight: "600" }}>Add Set</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Notes</Text>
          <TextInput
            style={[styles.input, { height: 60 }]}
            placeholder="Optional notes"
            placeholderTextColor="#999"
            value={notes}
            onChangeText={setNotes}
            multiline
          />
        </View>
        <Text style={styles.volume}>Total volume: {isNaN(vol) ? 0 : vol}</Text>
      </View>
    </View>
  );
});

export default function DayViewScreen({ route, navigation }) {
  const { templateId, week, templateName } = route.params;
  const [day, setDay] = useState(1);
  const [exercises, setExercises] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [dayDone, setDayDone] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const allSelected =
    exercises.length > 0 && selectedIds.size === exercises.length;
  const totalVolume = useMemo(
    () =>
      exercises.reduce(
        (sum, e) =>
          sum +
          (Number(
            e?.volume ?? (e?.sets || 0) * (e?.reps || 0) * (e?.weight || 0)
          ) || 0),
        0
      ),
    [exercises]
  );

  const load = useCallback(
    async (opts = { showSpinner: false }) => {
      if (opts.showSpinner) setRefreshing(true);
      try {
        const data = await getExercises(templateId, week, day);
        // Only update list if ids / order changed (prevents re-mount + shift)
        const idsPrev = exercises.map((e) => e.id);
        const idsNext = data.map((e) => e.id);
        let changed = false;
        if (idsPrev.length !== idsNext.length) changed = true;
        else {
          for (let i = 0; i < idsPrev.length; i++) {
            if (idsPrev[i] !== idsNext[i]) {
              changed = true;
              break;
            }
          }
        }
        if (changed) {
          // Preserve object references for unchanged items to keep Swipeable stable
          const prevMap = new Map(exercises.map((e) => [e.id, e]));
          const merged = data.map((d) => {
            const old = prevMap.get(d.id);
            if (!old) return d; // newly added
            return old; // keep old reference; internal card manages its own state
          });
          setExercises(merged);
        }
      } finally {
        if (opts.showSpinner) setRefreshing(false);
      }
    },
    [templateId, week, day, exercises]
  );

  useEffect(() => {
    navigation.setOptions({
      title: `${templateName || "Template"} - Week ${week}`,
    });
  }, [navigation, templateName, week]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => load());
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    load();
    (async () => {
      const done = await getDayCompleted(templateId, week, day);
      setDayDone(done);
    })();
  }, [day, load, templateId, week]);

  // Track which exercise ids have already appeared to avoid re-animating
  const renderItem = ({ item }) => {
    return (
      <Swipeable
        renderRightActions={() => (
          <View style={styles.swipeDeleteWrap}>
            <TouchableOpacity
              style={styles.swipeDelete}
              onPress={() => {
                Alert.alert("Delete Exercise", "Remove this exercise?", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await Haptics.impactAsync(
                          Haptics.ImpactFeedbackStyle.Medium
                        );
                      } catch {}
                      await deleteExercise(item.id);
                      await load();
                    },
                  },
                ]);
              }}
            >
              <Ionicons name="trash-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>
        )}
        overshootRight={false}
        rightThreshold={96}
        friction={2}
        onSwipeableOpen={(direction) => {
          if (direction === "right" && !selectMode) {
            (async () => {
              try {
                try {
                  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                } catch {}
                await deleteExercise(item.id);
                await load();
              } catch {}
            })();
          }
        }}
      >
        <ExerciseCard
          exercise={item}
          onSave={async (payload) => {
            await updateExerciseWithSets(payload);
            // Optimistic in-place update to prevent full list re-layout bounce
            setExercises((prev) =>
              prev.map((ex) =>
                ex.id === payload.id
                  ? {
                      ...ex,
                      name: payload.name,
                      notes: payload.notes,
                      setRows: (payload.setRows || []).map((r, idx) => ({
                        setNumber: idx + 1,
                        reps: r.reps,
                        weight: r.weight,
                      })),
                      volume: (payload.setRows || []).reduce(
                        (sum, r) =>
                          sum + (Number(r.reps) || 0) * (Number(r.weight) || 0),
                        0
                      ),
                    }
                  : ex
              )
            );
          }}
          isSelectMode={selectMode}
          isSelected={selectedIds.has(item.id)}
          onToggleSelect={() =>
            setSelectedIds((prev) => {
              const next = new Set(prev);
              if (next.has(item.id)) next.delete(item.id);
              else next.add(item.id);
              return next;
            })
          }
        />
      </Swipeable>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <View style={styles.weekWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipsRow}
            style={styles.dayTabsBar}
          >
            <View style={styles.weekInner}>
              {DAY_NAMES.map((d, idx) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.chip, day === idx + 1 && styles.chipActive]}
                  onPress={() => setDay(idx + 1)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      day === idx + 1 && styles.chipTextActive,
                    ]}
                  >
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.summaryBar}>
          <View style={styles.summaryLeft}>
            <Text style={styles.summaryDay}>{DAY_NAMES[day - 1]}</Text>
            <Text style={styles.summaryMeta} numberOfLines={1}>
              {` · Exercises: ${exercises.length} · Volume: ${totalVolume}`}
            </Text>
          </View>
          <TouchableOpacity
            onPress={async () => {
              const next = !dayDone;
              setDayDone(next);
              await setDayCompleted(templateId, week, day, next);
            }}
            style={styles.dayDone}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, dayDone && styles.checkboxOn]} />
            <Text style={styles.doneText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* selection controls */}
        {!selectMode ? (
          <View style={styles.rowButtons}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => setSelectMode(true)}
            >
              <Ionicons
                name="checkmark-done-outline"
                size={18}
                color="#0a84ff"
              />
              <Text style={styles.secondaryButtonText}>Select</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.selectionHeaderBar}>
            <TouchableOpacity
              onPress={() => {
                if (allSelected) setSelectedIds(new Set());
                else setSelectedIds(new Set(exercises.map((e) => e.id)));
              }}
              style={styles.selectionHeaderButton}
            >
              <Ionicons
                name={allSelected ? "radio-button-on" : "radio-button-off"}
                size={22}
                color={allSelected ? "#0a84ff" : "#666"}
              />
              <Text style={styles.selectionHeaderText}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setSelectMode(false);
                setSelectedIds(new Set());
              }}
              style={styles.selectionHeaderButtonRight}
            >
              <Text style={styles.selectionHeaderCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        <FlatList
          style={{ marginTop: 8, flex: 1 }}
          data={exercises}
          keyExtractor={(i) => String(i.id)}
          refreshing={refreshing}
          // Only user pull-to-refresh shows spinner; pass showSpinner true
          onRefresh={() => load({ showSpinner: true })}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
          removeClippedSubviews={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          renderItem={renderItem}
          ListFooterComponent={<View style={styles.listFooterSpacer} />}
          ListEmptyComponent={
            <Text style={{ textAlign: "center", marginTop: 24 }}>
              No exercises for this day.
            </Text>
          }
          contentContainerStyle={selectMode ? { paddingBottom: 120 } : null}
        />

        {selectMode && (
          <View style={styles.selectionActionsBar}>
            <Text style={styles.selCountText}>{selectedIds.size} selected</Text>
            <TouchableOpacity
              style={styles.selActionBtn}
              onPress={() => {
                const ids = Array.from(selectedIds);
                if (!ids.length) return;
                Alert.alert(
                  "Delete",
                  `Delete ${ids.length} exercise(s)? This cannot be undone.`,
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Delete",
                      style: "destructive",
                      onPress: async () => {
                        try {
                          await Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Heavy
                          );
                        } catch {}
                        for (const id of ids) {
                          try {
                            await deleteExercise(id);
                          } catch {}
                        }
                        await load();
                        setSelectMode(false);
                        setSelectedIds(new Set());
                      },
                    },
                  ]
                );
              }}
              disabled={!selectedIds.size}
            >
              <Ionicons
                name="trash-outline"
                size={22}
                color={selectedIds.size ? "#d11a2a" : "#bbb"}
              />
              <Text
                style={[
                  styles.selActionLabel,
                  { color: selectedIds.size ? "#d11a2a" : "#bbb" },
                ]}
              >
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <TouchableOpacity
          onPress={() =>
            navigation.navigate("ExerciseForm", { templateId, week, day })
          }
          style={styles.fab}
          activeOpacity={0.8}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#fff" },
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 6,
    paddingBottom: 12,
    backgroundColor: "#fff",
  },
  weekWrap: {
    height: 32,
    marginBottom: 4,
  },
  dayTabsBar: {
    flex: 1,
    marginBottom: 0,
    paddingVertical: 0,
    overflow: "hidden",
  },
  chipsRow: {
    height: 32,
    flexGrow: 0,
    alignItems: "center",
    paddingRight: 8,
  },
  weekInner: {
    flexDirection: "row",
    alignItems: "center",
    height: 32,
    alignSelf: "flex-start",
  },
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: "#f2f2f2",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#e5e5e5",
  },
  chipActive: { backgroundColor: "#000", borderColor: "#000" },
  chipText: { color: "#333", fontWeight: "500", fontSize: 13, lineHeight: 17 },
  chipTextActive: { color: "#fff" },
  dayDone: { flexDirection: "row", alignItems: "center", marginBottom: 0 },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 1,
    borderColor: "#999",
    borderRadius: 4,
    backgroundColor: "#fff",
  },
  checkboxOn: { backgroundColor: "#2ecc71", borderColor: "#2ecc71" },
  doneText: { marginLeft: 6, fontSize: 12, color: "#333" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
    backgroundColor: "#fff",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  title: { fontSize: 15, fontWeight: "700", color: "#111" },
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  fieldLabel: {
    fontSize: 11,
    color: "#666",
    marginBottom: 4,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#fff",
  },
  num: { maxWidth: 110 },
  volume: { marginTop: 4, fontWeight: "600" },
  cardActions: { gap: 8, alignItems: "center" },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e9e9e9",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  swipeDeleteWrap: {
    width: 72,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#d11a2a",
    borderRadius: 12,
    marginBottom: 12,
  },
  swipeDelete: {
    flex: 1,
    width: 72,
    justifyContent: "center",
    alignItems: "center",
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  fabText: { color: "#fff", fontSize: 28, lineHeight: 30, fontWeight: "700" },
  summaryBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 8,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  summaryLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1 },
  summaryDay: { fontSize: 14, color: "#111", fontWeight: "800" },
  summaryMeta: { fontSize: 12, color: "#555", flexShrink: 1 },
  listFooterSpacer: { height: 220 },
  // selection toolbar styles
  rowButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe7ff",
    backgroundColor: "#f5f9ff",
  },
  secondaryButtonText: { color: "#0a84ff", fontWeight: "600" },
  // sets header
  setsHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    marginBottom: 2,
    marginTop: 2,
  },
  setsHeaderIndex: { width: 20 },
  setsHeaderLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "#888",
    paddingLeft: 4,
  },
  setsHeaderSpacer: { width: 32 },
  // selection paradigm additions
  selectionHeaderBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  selectionHeaderButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 4,
  },
  selectionHeaderButtonRight: { padding: 4 },
  selectionHeaderText: { fontSize: 13, fontWeight: "600", color: "#0a84ff" },
  selectionHeaderCancel: { fontSize: 13, fontWeight: "600", color: "#0a84ff" },
  selectionActionsBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 22,
    paddingTop: 12,
    backgroundColor: "#ffffffee",
    borderTopWidth: 1,
    borderColor: "#e5e5e5",
    gap: 48,
  },
  selActionBtn: { alignItems: "center", gap: 4 },
  selActionLabel: { fontSize: 12, fontWeight: "600" },
  selCountText: {
    position: "absolute",
    left: 16,
    top: 12,
    fontSize: 12,
    fontWeight: "600",
    color: "#444",
  },
});
