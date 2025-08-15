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
import Animated, {
  Layout,
  FadeIn,
  SlideOutLeft,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import {
  getExercises,
  deleteExercise,
  updateExercise,
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
  const [sets, setSets] = React.useState(
    exercise.sets ? String(exercise.sets) : ""
  );
  const [reps, setReps] = React.useState(
    exercise.reps ? String(exercise.reps) : ""
  );
  const [weight, setWeight] = React.useState(
    exercise.weight ? String(exercise.weight) : ""
  );
  const [notes, setNotes] = React.useState(exercise.notes || "");
  const saveTimer = React.useRef(null);

  const vol = (Number(sets) || 0) * (Number(reps) || 0) * (Number(weight) || 0);

  // Debounced auto-save when fields change (disabled during select mode)
  React.useEffect(() => {
    // cancel previous timer
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (isSelectMode) return; // don't save while selecting

    const parsed = {
      id: exercise.id,
      name,
      sets: sets ? parseInt(sets, 10) : null,
      reps: reps ? parseInt(reps, 10) : null,
      weight: weight ? parseFloat(weight) : null,
      notes: notes || null,
    };

    // Skip if nothing changed compared to current props
    const same =
      (exercise.name || "") === parsed.name &&
      (exercise.sets ?? null) === parsed.sets &&
      (exercise.reps ?? null) === parsed.reps &&
      (exercise.weight ?? null) === parsed.weight &&
      (exercise.notes ?? null) === parsed.notes;
    if (same) return;

    saveTimer.current = setTimeout(() => {
      onSave(parsed);
    }, 700);

    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [
    name,
    sets,
    reps,
    weight,
    notes,
    isSelectMode,
    exercise.id,
    exercise.name,
    exercise.sets,
    exercise.reps,
    exercise.weight,
    exercise.notes,
    onSave,
  ]);

  return (
    <View style={styles.card}>
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
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Sets</Text>
            <TextInput
              style={[styles.input, styles.num]}
              placeholder="Sets"
              keyboardType="number-pad"
              placeholderTextColor="#999"
              value={sets}
              onChangeText={setSets}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Reps</Text>
            <TextInput
              style={[styles.input, styles.num]}
              placeholder="Reps"
              keyboardType="number-pad"
              placeholderTextColor="#999"
              value={reps}
              onChangeText={setReps}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Weight</Text>
            <TextInput
              style={[styles.input, styles.num]}
              placeholder="kg/lb"
              keyboardType="decimal-pad"
              placeholderTextColor="#999"
              value={weight}
              onChangeText={setWeight}
            />
          </View>
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
      {isSelectMode ? (
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={onToggleSelect}
            style={[styles.iconButton]}
            accessibilityRole="button"
            accessibilityLabel={isSelected ? "Deselect" : "Select"}
          >
            <Ionicons
              name={isSelected ? "checkbox-outline" : "square-outline"}
              size={22}
              color={isSelected ? "#0a84ff" : "#999"}
            />
          </TouchableOpacity>
        </View>
      ) : null}
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

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await getExercises(templateId, week, day);
      setExercises(data);
    } finally {
      setRefreshing(false);
    }
  }, [templateId, week, day]);

  useEffect(() => {
    navigation.setOptions({
      title: `${templateName || "Template"} - Week ${week}`,
    });
  }, [navigation, templateName, week]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation, load]);

  useEffect(() => {
    load();
    (async () => {
      const done = await getDayCompleted(templateId, week, day);
      setDayDone(done);
    })();
  }, [day, load, templateId, week]);

  const renderItem = ({ item }) => (
    <Animated.View
      layout={Layout.springify().damping(16).stiffness(140)}
      entering={FadeIn.duration(140)}
      exiting={SlideOutLeft.duration(220)}
    >
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
            await updateExercise(payload);
            await load();
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
    </Animated.View>
  );

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

        {/* selection toolbar */}
        <View style={styles.rowButtons}>
          {!selectMode ? (
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
          ) : (
            <>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() =>
                  setSelectedIds(new Set(exercises.map((e) => e.id)))
                }
              >
                <Ionicons name="checkbox-outline" size={18} color="#0a84ff" />
                <Text style={styles.secondaryButtonText}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setSelectedIds(new Set())}
              >
                <Ionicons name="square-outline" size={18} color="#0a84ff" />
                <Text style={styles.secondaryButtonText}>None</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  const ids = Array.from(selectedIds);
                  if (!ids.length) {
                    Alert.alert("Nothing selected");
                    return;
                  }
                  Alert.alert(
                    "Delete Exercises",
                    `Delete ${ids.length} item(s)? This cannot be undone.`,
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
              >
                <Ionicons name="trash-outline" size={18} color="#cc0000" />
                <Text
                  style={[styles.secondaryButtonText, { color: "#cc0000" }]}
                >
                  Delete Selected
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => {
                  setSelectMode(false);
                  setSelectedIds(new Set());
                }}
              >
                <Ionicons name="close-outline" size={18} color="#0a84ff" />
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <FlatList
          style={{ marginTop: 8, flex: 1 }}
          data={exercises}
          keyExtractor={(i) => String(i.id)}
          refreshing={refreshing}
          onRefresh={load}
          extraData={{ ex: exercises, sel: selectMode, n: selectedIds.size }}
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
        />

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
  saveButton: {},
  deleteButton: {},
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
});
