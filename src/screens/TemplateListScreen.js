import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  createTemplate,
  getTemplates,
  deleteTemplate,
  resetDb,
  exportTemplatesJson, 
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
  const [namePrompt, setNamePrompt] = useState({
    visible: false,
    defaultName: "",
    onSubmit: null,
    error: "",
  });
  const [multiImport, setMultiImport] = useState({
    visible: false,
    items: [],
    busy: false,
  });
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [exportPrompt, setExportPrompt] = useState({
    visible: false,
    filename: "",
    json: "",
    busy: false,
  });
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const selectAll = () => {
    setSelectedIds(new Set(templates.map((t) => t.id)));
  };
  const selectNone = () => {
    setSelectedIds(new Set());
  };
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };
  const exportSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("Nothing selected");
      return;
    }
    try {
      const payload = await exportTemplatesJson(ids);
      const json = JSON.stringify(payload, null, 2);
      const filename = `traintrack-export-${Date.now()}-selected-${
        ids.length
      }.json`;

      const shareIt = async () => {
        const uri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(uri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(uri, { mimeType: "application/json" });
        } else {
          Alert.alert("Exported", `Saved to temporary file: ${uri}`);
        }
      };

      if (Platform.OS === "android") {
        setExportPrompt({ visible: true, filename, json, busy: false });
      } else {
        await shareIt();
      }
    } catch (e) {
      Alert.alert("Export failed", e?.message || "Could not export");
    }
  };
  const deleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      Alert.alert("Nothing selected");
      return;
    }
    Alert.alert(
      "Delete Templates",
      `Delete ${ids.length} template(s)? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of ids) {
              try {
                await deleteTemplate(id);
              } catch {}
            }
            await load();
            exitSelectMode();
          },
        },
      ]
    );
  };

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

  // removed unused handlers: confirmDelete, onExportOne

  const renderItem = ({ item }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.85}
        onPress={() => {
          if (selectMode) toggleSelect(item.id);
          else
            navigation.navigate("WeekView", {
              templateId: item.id,
              templateName: item.name,
            });
        }}
        onLongPress={() => {
          if (!selectMode) {
            setSelectMode(true);
            setSelectedIds(new Set([item.id]));
          }
        }}
      >
        {selectMode ? (
          <View style={{ marginRight: 8 }}>
            <Ionicons
              name={isSelected ? "checkbox-outline" : "square-outline"}
              size={22}
              color={isSelected ? "#0a84ff" : "#999"}
            />
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{item.name}</Text>
          <Text style={styles.cardSubtitle}>{item.weeks} weeks</Text>
        </View>
        {!selectMode && (
          <Ionicons name="chevron-forward" size={20} color="#9a9a9a" />
        )}
      </TouchableOpacity>
    );
  };

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
      {/* top actions: selection + import */}
      <View style={styles.rowButtons}>
        {!selectMode ? (
          <>
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
              {/* swapped icon for Import to look like download */}
              <Ionicons
                name="cloud-download-outline"
                size={18}
                color="#0a84ff"
              />
              <Text style={styles.secondaryButtonText}>Import</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={selectAll}
            >
              <Ionicons name="checkbox-outline" size={18} color="#0a84ff" />
              <Text style={styles.secondaryButtonText}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={selectNone}
            >
              <Ionicons name="square-outline" size={18} color="#0a84ff" />
              <Text style={styles.secondaryButtonText}>None</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={exportSelected}
            >
              {/* swapped icon for Export to look like upload */}
              <Ionicons name="cloud-upload-outline" size={18} color="#0a84ff" />
              <Text style={styles.secondaryButtonText}>Export Selected</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={deleteSelected}
            >
              <Ionicons name="trash-outline" size={18} color="#cc0000" />
              <Text style={[styles.secondaryButtonText, { color: "#cc0000" }]}>
                Delete Selected
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={exitSelectMode}
            >
              <Ionicons name="close-outline" size={18} color="#0a84ff" />
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
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
        {/* Advanced (collapsed) to hide reset from main UI */}
        <TouchableOpacity
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            alignSelf: "flex-start",
          }}
          onPress={() => setAdvancedOpen((v) => !v)}
        >
          <Ionicons
            name={
              advancedOpen ? "chevron-down-outline" : "chevron-forward-outline"
            }
            size={16}
            color="#6b6b6b"
          />
          <Text style={{ color: "#6b6b6b" }}>Advanced</Text>
        </TouchableOpacity>
        {advancedOpen && (
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
        )}
      </View>

      {/* name prompt modal */}
      <NamePromptModal state={namePrompt} setState={setNamePrompt} />
      {/* pick template modal removed */}
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
      {/* export destination modal (Android) */}
      <ExportDestinationModal state={exportPrompt} setState={setExportPrompt} />
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
  emptyText: { textAlign: "center", marginTop: 16, color: "#666" },
  footer: { marginTop: 8 },
  rowButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
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
    marginBottom: 8,
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

// TemplatePickModal removed (unused)

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

// Bottom-sheet style modal for choosing export destination (Android)
function ExportDestinationModal({ state, setState }) {
  if (!state.visible) return null;
  const { filename, json, busy } = state;
  const close = () =>
    setState({ visible: false, filename: "", json: "", busy: false });

  const saveToFolder = async () => {
    if (busy) return;
    try {
      setState((s) => ({ ...s, busy: true }));
      const perm =
        await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!perm.granted) {
        // If not granted, fall back to share action
        await shareNow();
        return;
      }
      const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
        perm.directoryUri,
        filename,
        "application/json"
      );
      await FileSystem.writeAsStringAsync(fileUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      Alert.alert("Saved", `Saved as ${filename}`);
      close();
    } catch (err) {
      Alert.alert("Save failed", err?.message || "Unable to save the file");
      setState((s) => ({ ...s, busy: false }));
    }
  };

  const shareNow = async () => {
    if (busy) return;
    try {
      setState((s) => ({ ...s, busy: true }));
      const tempUri = FileSystem.cacheDirectory + filename;
      await FileSystem.writeAsStringAsync(tempUri, json, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(tempUri, { mimeType: "application/json" });
      } else {
        Alert.alert("Exported", `Saved to temporary file: ${tempUri}`);
      }
      close();
    } catch (err) {
      Alert.alert("Share failed", err?.message || "Unable to share the file");
      setState((s) => ({ ...s, busy: false }));
    }
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
        justifyContent: "flex-end",
      }}
      pointerEvents="box-none"
    >
      <View
        style={{
          backgroundColor: "#fff",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          paddingBottom: 12,
        }}
      >
        <View
          style={{ padding: 16, borderBottomWidth: 1, borderColor: "#eee" }}
        >
          <Text style={{ fontWeight: "700" }}>Export</Text>
          <Text
            style={{ color: "#666", marginTop: 4, fontSize: 12 }}
            numberOfLines={1}
          >
            {filename}
          </Text>
        </View>
        <TouchableOpacity
          disabled={busy}
          onPress={saveToFolder}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Ionicons name="folder-outline" size={20} color="#0a84ff" />
          <Text style={{ color: busy ? "#999" : "#0a84ff", fontWeight: "700" }}>
            Save to folder
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={shareNow}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingVertical: 14,
          }}
        >
          <Ionicons name="share-social-outline" size={20} color="#0a84ff" />
          <Text style={{ color: busy ? "#999" : "#0a84ff", fontWeight: "700" }}>
            Share…
          </Text>
        </TouchableOpacity>
        <View style={{ height: 8 }} />
        <TouchableOpacity
          disabled={busy}
          onPress={close}
          style={{
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            marginHorizontal: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#eee",
            backgroundColor: "#fafafa",
          }}
        >
          <Text style={{ color: "#333", fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
