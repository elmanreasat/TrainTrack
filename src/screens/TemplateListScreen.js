import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  Alert,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  createTemplate,
  getTemplates,
  deleteTemplate,
  resetDb,
} from "../db/db";
import {
  exportTemplatesJson,
  importTemplatesJson,
  importTemplateObjectWithName,
} from "../db/db";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";

export default function TemplateListScreen({ navigation }) {
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("");
  const [templates, setTemplates] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [importState, setImportState] = useState({
    visible: false,
    template: null,
    error: "",
  });
  const [namePrompt, setNamePrompt] = useState({
    visible: false,
    defaultName: "",
    onSubmit: null,
    error: "",
  });

  const load = async () => {
    setRefreshing(true);
    try {
      const data = await getTemplates();
      setTemplates(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    // Remove any headerRight reset; reset control is now in the footer card
    navigation.setOptions({ headerRight: undefined, title: "Your Training" });
    return unsub;
  }, [navigation]);

  const onCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Name required", "Please enter a unique template name.");
      return;
    }
    const w = parseInt(weeks, 10);
    if (Number.isNaN(w) || w <= 0) {
      Alert.alert("Invalid weeks", "Enter a positive number of weeks.");
      return;
    }
    try {
      await createTemplate(name, w);
      setName("");
      setWeeks("");
      await load();
    } catch (e) {
      Alert.alert("Could not create", e?.message || "Name must be unique.");
    }
  };

  const confirmDelete = (id) => {
    Alert.alert(
      "Delete Template",
      "This will remove the template and its exercises.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteTemplate(id);
            await load();
          },
        },
      ]
    );
  };

  const onExportOne = async (id) => {
    try {
      const payload = await exportTemplatesJson([id]);
      const json = JSON.stringify(payload, null, 2);
      const uri =
        FileSystem.cacheDirectory +
        `traintrack-export-${Date.now()}-template-${id}.json`;
      await FileSystem.writeAsStringAsync(uri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/json" });
      } else {
        Alert.alert("Exported", `Saved to temporary file: ${uri}`);
      }
    } catch (e) {
      Alert.alert("Export failed", e?.message || "Could not export");
    }
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate("WeekView", {
          templateId: item.id,
          templateName: item.name,
        })
      }
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{item.name}</Text>
        <Text style={styles.cardSubtitle}>{item.weeks} weeks</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color="#9a9a9a" />
      <TouchableOpacity
        accessibilityLabel="Export template"
        onPress={() => onExportOne(item.id)}
        style={styles.iconButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="cloud-download-outline" size={22} color="#0a84ff" />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Delete template"
        onPress={() => confirmDelete(item.id)}
        style={styles.iconButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={22} color="#cc0000" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.createCard}>
        <Text style={styles.header}>Create Template</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="Template name"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            style={[styles.input, styles.weeksInput]}
            placeholder="Weeks"
            keyboardType="number-pad"
            value={weeks}
            onChangeText={setWeeks}
          />
          <TouchableOpacity style={styles.addButton} onPress={onCreate}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Templates</Text>
      <FlatList
        data={templates}
        keyExtractor={(i) => String(i.id)}
        refreshing={refreshing}
        onRefresh={load}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No templates yet.</Text>
        }
        contentContainerStyle={{ paddingBottom: 24 }}
      />

      <View style={styles.footer}>
        <View style={styles.rowButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={async () => {
              try {
                // Export all templates (still useful)
                const payload = await exportTemplatesJson();
                const json = JSON.stringify(payload, null, 2);
                const uri =
                  FileSystem.cacheDirectory +
                  `traintrack-export-${Date.now()}.json`;
                await FileSystem.writeAsStringAsync(uri, json, {
                  encoding: FileSystem.EncodingType.UTF8,
                });
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(uri, {
                    mimeType: "application/json",
                  });
                } else {
                  Alert.alert("Exported", `Saved to temporary file: ${uri}`);
                }
              } catch (e) {
                Alert.alert("Export failed", e?.message || "Could not export");
              }
            }}
          >
            <Ionicons name="download-outline" size={18} color="#0a84ff" />
            <Text style={styles.secondaryButtonText}>Export All</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={async () => {
              try {
                const res = await DocumentPicker.getDocumentAsync({
                  type: ["application/json", "text/json", "*/*"],
                });
                if (res.canceled) return;
                const file = res.assets?.[0];
                if (!file?.uri) return;
                const content = await FileSystem.readAsStringAsync(file.uri, {
                  encoding: FileSystem.EncodingType.UTF8,
                });
                // Parse and let user choose which template and name
                const parsed = JSON.parse(content);
                if (!parsed?.templates?.length) {
                  Alert.alert("No templates in file");
                  return;
                }
                // If multiple templates, ask user to pick via a simple Alert action sheet style
                if (parsed.templates.length === 1) {
                  const tpl = parsed.templates[0];
                  setNamePrompt({
                    visible: true,
                    defaultName: tpl.name || "Imported Template",
                    error: "",
                    onSubmit: async (nm) => {
                      try {
                        const info = await importTemplateObjectWithName(
                          tpl,
                          nm
                        );
                        setNamePrompt({
                          visible: false,
                          defaultName: "",
                          onSubmit: null,
                          error: "",
                        });
                        await load();
                        Alert.alert(
                          "Imported",
                          `Created template \"${info.name}\".`
                        );
                      } catch (e) {
                        setNamePrompt((s) => ({
                          ...s,
                          error: e?.message || "Could not import",
                        }));
                      }
                    },
                  });
                } else {
                  // Multiple templates: quick picker via Alert with first three + 'Pick first' fallback
                  const options = parsed.templates
                    .slice(0, 3)
                    .map((t, idx) => ({
                      text: t.name || `Template ${idx + 1}`,
                      onPress: () => {
                        setNamePrompt({
                          visible: true,
                          defaultName: t.name || "Imported Template",
                          error: "",
                          onSubmit: async (nm) => {
                            try {
                              const info = await importTemplateObjectWithName(
                                t,
                                nm
                              );
                              setNamePrompt({
                                visible: false,
                                defaultName: "",
                                onSubmit: null,
                                error: "",
                              });
                              await load();
                              Alert.alert(
                                "Imported",
                                `Created template \"${info.name}\".`
                              );
                            } catch (e) {
                              setNamePrompt((s) => ({
                                ...s,
                                error: e?.message || "Could not import",
                              }));
                            }
                          },
                        });
                      },
                    }));
                  Alert.alert(
                    "Choose Template",
                    "Select one template to import",
                    [...options, { text: "Cancel", style: "cancel" }]
                  );
                }
              } catch (e) {
                Alert.alert("Import failed", e?.message || "Invalid file");
              }
            }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color="#0a84ff" />
            <Text style={styles.secondaryButtonText}>Import</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={styles.resetCard}
          activeOpacity={0.85}
          onPress={() =>
            Alert.alert(
              "Reset Database",
              "This will delete ALL templates, weeks, days, and exercises.",
              [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: async () => {
                    await resetDb();
                    await load();
                  },
                },
              ]
            )
          }
        >
          <View style={styles.resetIconWrap}>
            <Ionicons name="refresh-outline" size={20} color="#0a84ff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.resetTitle}>Reset Database</Text>
            <Text style={styles.resetSubtitle}>
              Clears all data and recreates the schema.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#6b6b6b" />
        </TouchableOpacity>
      </View>

      {/* name prompt modal */}
      <NamePromptModal state={namePrompt} setState={setNamePrompt} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f7f7f7" },
  header: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginVertical: 10,
    color: "#555",
  },
  row: { flexDirection: "row", gap: 8, alignItems: "center" },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#fff",
  },
  weeksInput: { maxWidth: 90 },
  addButton: {
    backgroundColor: "#000",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  createCard: {
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
  iconButton: {
    marginLeft: 8,
    padding: 6,
    borderRadius: 16,
    backgroundColor: "rgba(204,0,0,0.06)",
  },
  emptyText: { textAlign: "center", marginTop: 16, color: "#666" },
  footer: { marginTop: 8 },
  rowButtons: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dbe7ff",
    backgroundColor: "#f5f9ff",
  },
  secondaryButtonText: { color: "#0a84ff", fontWeight: "600" },
  resetCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#eee",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  resetIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e6f0ff",
  },
  resetTitle: { fontWeight: "700" },
  resetSubtitle: { color: "#6b6b6b", marginTop: 2, fontSize: 12 },
});

// Simple inline name prompt modal
// Using a lightweight approach to avoid extra dependencies
function NamePromptModal({ state, setState }) {
  if (!state.visible) return null;
  return (
    <View
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        backgroundColor: "rgba(0,0,0,0.3)",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          backgroundColor: "#fff",
          padding: 16,
          borderRadius: 12,
          width: "100%",
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          Choose a unique name
        </Text>
        <TextInput
          value={state.defaultName}
          onChangeText={(v) =>
            setState((s) => ({ ...s, defaultName: v, error: "" }))
          }
          placeholder="Template name"
          style={{
            borderWidth: 1,
            borderColor: "#ddd",
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 10,
          }}
        />
        {!!state.error && (
          <Text style={{ color: "#cc0000", marginTop: 8 }}>{state.error}</Text>
        )}
        <View
          style={{
            flexDirection: "row",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 12,
          }}
        >
          <TouchableOpacity
            onPress={() =>
              setState({
                visible: false,
                defaultName: "",
                onSubmit: null,
                error: "",
              })
            }
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => state.onSubmit?.(state.defaultName)}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text style={{ color: "#0a84ff", fontWeight: "700" }}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
