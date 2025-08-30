import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { addExercise } from "../db/db";

export default function ExerciseFormScreen({ route, navigation }) {
  const { templateId, week, day } = route.params;

  const [name, setName] = useState("");
  // aggregate legacy fields kept for quick entry but we'll create dynamic rows
  const [sets, setSets] = useState("");
  const [reps, setReps] = useState("");
  const [weight, setWeight] = useState("");
  const [notes, setNotes] = useState("");

  const onAdd = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter an exercise name.");
      return;
    }
    try {
      const nSets = sets ? parseInt(sets, 10) : 0;
      const defaultReps = reps ? parseInt(reps, 10) : null;
      const defaultWeight = weight ? parseFloat(weight) : null;
      let initialSetRows = [];
      if (nSets > 0) {
        initialSetRows = Array.from({ length: nSets }, () => ({
          reps: defaultReps,
          weight: defaultWeight,
        }));
      } else {
        initialSetRows = [{ reps: defaultReps, weight: defaultWeight }];
      }
      await addExercise({
        templateId,
        week,
        day,
        name,
        sets: nSets || null,
        reps: defaultReps,
        weight: defaultWeight,
        notes: notes || null,
        initialSetRows,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not add exercise");
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
      >
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.header}>Add Exercise</Text>

          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Bench Press"
              placeholderTextColor="#999"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.label}>Sets</Text>
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
              <Text style={styles.label}>Reps</Text>
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
              <Text style={styles.label}>Weight</Text>
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
            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="Optional notes"
              placeholderTextColor="#999"
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={onAdd}>
            <Text style={styles.primaryBtnText}>Add Exercise</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12, paddingBottom: 24 },
  header: { fontSize: 20, fontWeight: "800", color: "#111", marginBottom: 4 },
  row: { flexDirection: "row", gap: 8 },
  field: { flex: 1 },
  label: { fontSize: 12, color: "#666", marginBottom: 6, fontWeight: "600" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  num: { maxWidth: 110 },
  primaryBtn: {
    marginTop: 8,
    alignSelf: "flex-start",
    backgroundColor: "#000",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700" },
});
