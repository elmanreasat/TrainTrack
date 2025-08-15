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
  const [pickPrompt, setPickPrompt] = useState({
    visible: false,
    templates: [],
    onSelect: null,
  });
  const [multiImport, setMultiImport] = useState({
    visible: false,
    items: [],
    busy: false,
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
                const startImport = (tpl) => {
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
                      } catch (err) {
                        const msg =
                          err && err.message
                            ? String(err.message)
                            : "Template name must be unique.";
                        setNamePrompt((s) => ({ ...s, error: msg }));
                      }
                    },
                  });
                };
                if (parsed.templates.length === 1) {
                  startImport(parsed.templates[0]);
                } else {
                  // Enable multi-select import with editable names
                  const items = parsed.templates.map((t) => ({
                    tpl: t,
                    name: t.name || "Imported Template",
                    selected: true,
                    error: "",
                  }));
                  setMultiImport({ visible: true, items, busy: false });
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
      {/* pick template modal */}
      <TemplatePickModal state={pickPrompt} setState={setPickPrompt} />
      {/* multi import modal */}
      <TemplateMultiImportModal
        state={multiImport}
        setState={setMultiImport}
        existingNames={templates.map((t) => t.name)}
        onDone={async (importedCount, failedCount) => {
          setMultiImport({ visible: false, items: [], busy: false });
          await load();
          Alert.alert(
            "Import complete",
            `Imported ${importedCount} template(s)` +
              (failedCount ? `, ${failedCount} failed` : "")
          );
        }}
      />
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

// Modal to pick a template from an imported file
function TemplatePickModal({ state, setState }) {
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
          borderRadius: 12,
          width: "100%",
          maxHeight: 420,
        }}
      >
        <View
          style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee" }}
        >
          <Text style={{ fontWeight: "700" }}>Choose Template</Text>
          <Text style={{ color: "#666", marginTop: 4, fontSize: 12 }}>
            Select one template to import
          </Text>
        </View>
        <FlatList
          data={state.templates || []}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item }) => {
            const exCount = Array.isArray(item.exercises)
              ? item.exercises.length
              : 0;
            const wCount = Number.isFinite(item.weeks)
              ? item.weeks
              : Array.isArray(item.weeksTable)
              ? item.weeksTable.reduce((m, w) => Math.max(m, w.week || 0), 0)
              : 0;
            return (
              <TouchableOpacity
                style={{
                  padding: 14,
                  borderBottomWidth: 1,
                  borderColor: "#f1f1f1",
                }}
                onPress={() => state.onSelect?.(item)}
              >
                <Text style={{ fontWeight: "600" }}>
                  {item.name || "Untitled Template"}
                </Text>
                <Text style={{ color: "#666", marginTop: 4, fontSize: 12 }}>
                  {wCount} weeks · {exCount} exercises
                </Text>
              </TouchableOpacity>
            );
          }}
          style={{ maxHeight: 320 }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 12,
          }}
        >
          <TouchableOpacity
            onPress={() =>
              setState({ visible: false, templates: [], onSelect: null })
            }
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// Modal to import multiple templates at once
function TemplateMultiImportModal({ state, setState, existingNames, onDone }) {
  if (!state.visible) return null;
  const items = state.items || [];
  const nameExists = (name, idx) => {
    if (!name) return "Name required";
    const inList = items.some(
      (it, i) => i !== idx && it.selected && it.name.trim() === name.trim()
    );
    const inDb = existingNames?.includes(name.trim());
    if (inList || inDb) return "Template name must be unique.";
    return "";
  };
  const updateItem = (idx, patch) => {
    const next = items.slice();
    next[idx] = { ...next[idx], ...patch };
    setState({ ...state, items: next });
  };
  const toggleSelect = (idx) =>
    updateItem(idx, { selected: !items[idx].selected, error: "" });
  const setName = (idx, name) => updateItem(idx, { name, error: "" });
  const importAll = async () => {
    if (state.busy) return;
    // Validate names
    let hasError = false;
    const next = items.map((it, idx) => {
      if (!it.selected) return it;
      const err = nameExists(it.name, idx);
      if (err) hasError = true;
      return { ...it, error: err };
    });
    if (hasError) {
      setState({ ...state, items: next });
      return;
    }
    // Import
    setState({ ...state, busy: true });
    let ok = 0,
      fail = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.selected) continue;
      try {
        await importTemplateObjectWithName(it.tpl, it.name.trim());
        ok += 1;
      } catch (err) {
        fail += 1;
      }
    }
    setState({ visible: false, items: [], busy: false });
    onDone?.(ok, fail);
  };

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
          borderRadius: 12,
          width: "100%",
          maxHeight: 520,
        }}
      >
        <View
          style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee" }}
        >
          <Text style={{ fontWeight: "700" }}>Import Templates</Text>
          <Text style={{ color: "#666", marginTop: 4, fontSize: 12 }}>
            Select and name templates to import
          </Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(_, idx) => String(idx)}
          renderItem={({ item, index }) => (
            <View
              style={{
                padding: 12,
                borderBottomWidth: 1,
                borderColor: "#f1f1f1",
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TouchableOpacity
                  onPress={() => toggleSelect(index)}
                  style={{ padding: 6 }}
                >
                  <Ionicons
                    name={item.selected ? "checkbox-outline" : "square-outline"}
                    size={20}
                    color={item.selected ? "#0a84ff" : "#999"}
                  />
                </TouchableOpacity>
                <Text style={{ flex: 1, fontWeight: "600" }} numberOfLines={1}>
                  {item.tpl?.name || "Untitled Template"}
                </Text>
              </View>
              <TextInput
                value={item.name}
                onChangeText={(v) => setName(index, v)}
                placeholder="New unique name"
                style={{
                  borderWidth: 1,
                  borderColor: item.error ? "#cc0000" : "#ddd",
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  marginTop: 8,
                }}
              />
              {!!item.error && (
                <Text style={{ color: "#cc0000", marginTop: 6 }}>
                  {item.error}
                </Text>
              )}
            </View>
          )}
          style={{ maxHeight: 380 }}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            padding: 12,
            gap: 8,
          }}
        >
          <TouchableOpacity
            disabled={state.busy}
            onPress={() => setState({ visible: false, items: [], busy: false })}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={importAll}
            disabled={state.busy}
            style={{ paddingVertical: 10, paddingHorizontal: 12 }}
          >
            <Text
              style={{
                color: state.busy ? "#999" : "#0a84ff",
                fontWeight: "700",
              }}
            >
              {state.busy ? "Importing…" : "Import Selected"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
