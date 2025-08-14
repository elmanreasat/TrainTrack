import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { addExercise } from "../db/db";

export default function ExerciseFormScreen({ route, navigation }) {
  const { templateId, week, day } = route.params;

  const [name, setName] = useState("");
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
      await addExercise({
        templateId,
        week,
        day,
        name,
        sets: sets ? parseInt(sets, 10) : null,
        reps: reps ? parseInt(reps, 10) : null,
        weight: weight ? parseFloat(weight) : null,
        notes: notes || null,
      });
      navigation.goBack();
    } catch (e) {
      Alert.alert("Error", e?.message || "Could not add exercise");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>Add Exercise</Text>
      <TextInput
        style={styles.input}
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />

      <View style={styles.row}>
        <TextInput
          style={[styles.input, styles.num]}
          placeholder="Sets"
          keyboardType="number-pad"
          value={sets}
          onChangeText={setSets}
        />
        <TextInput
          style={[styles.input, styles.num]}
          placeholder="Reps"
          keyboardType="number-pad"
          value={reps}
          onChangeText={setReps}
        />
        <TextInput
          style={[styles.input, styles.num]}
          placeholder="Weight"
          keyboardType="decimal-pad"
          value={weight}
          onChangeText={setWeight}
        />
      </View>

      <TextInput
        style={[styles.input, { height: 100 }]}
        placeholder="Notes"
        value={notes}
        onChangeText={setNotes}
        multiline
      />

      <Button title="Add" onPress={onAdd} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 12 },
  header: { fontSize: 18, fontWeight: "600" },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 10,
    backgroundColor: "#fff",
  },
  num: { maxWidth: 110 },
});
