import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listWeeks, ensureWeekDays, setWeekStatus } from "../db/db";

export default function WeekViewScreen({ route, navigation }) {
  const { templateId, templateName } = route.params;
  const [weeks, setWeeks] = useState([]);

  const load = useCallback(async () => {
    const w = await listWeeks(templateId);
    setWeeks(w);
  }, [templateId]);

  useEffect(() => {
    navigation.setOptions({ title: templateName || "Weeks" });
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation, templateId, templateName, load]);

  const openWeek = async (week) => {
    await ensureWeekDays(templateId, week);
    navigation.navigate("DayView", { templateId, week, templateName });
  };

  const renderItem = ({ item }) => {
    const completed = !!item.weekCompleted;
    const daysDone = item.daysCompleted || 0;
    const weekNumber = item.week || item;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => openWeek(weekNumber)}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{`Week ${weekNumber}`}</Text>
          <Text style={styles.cardSubtitle}>{`${daysDone}/7 days`}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#9a9a9a" />
        <TouchableOpacity
          accessibilityLabel={
            completed ? "Mark week incomplete" : "Mark week complete"
          }
          onPress={async () => {
            await setWeekStatus(templateId, weekNumber, !completed);
            await load();
          }}
          style={[styles.completePill, completed && styles.completePillOn]}
          activeOpacity={0.8}
        >
          {completed ? (
            <Ionicons name="checkmark-circle" size={22} color="#2ecc71" />
          ) : (
            <Ionicons name="ellipse-outline" size={22} />
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {weeks.length > 0 && (
        <View style={styles.progressHeader}>
          {(() => {
            const totalDays = weeks.length * 7;
            const doneDays = weeks.reduce(
              (sum, x) => sum + (x.daysCompleted || 0),
              0
            );
            const pct = totalDays
              ? Math.round((doneDays / totalDays) * 100)
              : 0;
            return (
              <>
                <Text style={styles.progressLabel}>
                  Overall Progress: {doneDays}/{totalDays} days ({pct}%)
                </Text>
                <View style={styles.progressBarOuter}>
                  <View
                    style={[styles.progressBarInner, { width: `${pct}%` }]}
                  />
                </View>
              </>
            );
          })()}
        </View>
      )}
      <FlatList
        data={weeks}
        keyExtractor={(i) => String(i.week || i)}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={{ textAlign: "center", marginTop: 24 }}>
            No weeks found.
          </Text>
        }
      />
      <TouchableOpacity
        style={styles.copyWeekButton}
        onPress={() =>
          navigation.navigate("CopyWeek", { templateId, templateName })
        }
        activeOpacity={0.9}
      >
        <Ionicons name="copy-outline" size={18} color="#fff" />
        <Text style={styles.copyWeekText}>Copy Week</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f7f7f7" },
  progressHeader: { marginBottom: 12 },
  progressLabel: { marginBottom: 6, fontWeight: "600" },
  progressBarOuter: {
    height: 10,
    backgroundColor: "#eee",
    borderRadius: 6,
    overflow: "hidden",
  },
  progressBarInner: { height: 10, backgroundColor: "#000" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#eee",
    marginBottom: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 16, fontWeight: "700" },
  cardSubtitle: { color: "#777", marginTop: 4 },
  completePill: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "transparent",
    marginLeft: 6,
  },
  completePillOn: { backgroundColor: "#eafaf1" },
  copyWeekButton: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 16,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#000",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    elevation: 3,
  },
  copyWeekText: { color: "#fff", fontWeight: "700" },
});
