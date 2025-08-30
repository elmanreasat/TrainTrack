// Clean rebuild of screen with file-app style selection UI
import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as DocumentPicker from "expo-document-picker";
import {
  createTemplate,
  getTemplates,
  deleteTemplate,
  resetDb,
  exportTemplatesJson,
  importTemplateObjectWithName,
} from "../db/db";

export default function TemplateListScreen({ navigation }) {
  const [name, setName] = useState("");
  const [weeks, setWeeks] = useState("");
  const [templates, setTemplates] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
  const [exportPrompt, setExportPrompt] = useState({
    visible: false,
    filename: "",
    json: "",
    busy: false,
  });

  const allSelected =
    templates.length > 0 && selectedIds.size === templates.length;

  const load = useCallback(
    async (opts = { showSpinner: false }) => {
      if (opts.showSpinner) setRefreshing(true);
      try {
        const data = await getTemplates();
        // diff by id/order to avoid re-layout bounce
        let changed = false;
        if (data.length !== templates.length) changed = true;
        if (!changed) {
          for (let i = 0; i < data.length; i++) {
            if (data[i].id !== templates[i].id) {
              changed = true;
              break;
            }
          }
        }
        if (changed) {
          const prevMap = new Map(templates.map((t) => [t.id, t]));
          setTemplates(data.map((d) => prevMap.get(d.id) || d));
        }
      } finally {
        if (opts.showSpinner) setRefreshing(false);
      }
    },
    [templates]
  );

  useEffect(() => {
    load();
  }, [load]);

  const onCreate = async () => {
    if (!name.trim()) {
      Alert.alert("Name required");
      return;
    }
    const w = parseInt(weeks, 10);
    if (!w || w < 1) {
      Alert.alert("Invalid weeks");
      return;
    }
    try {
      await createTemplate(name.trim(), w);
      setName("");
      setWeeks("");
      load();
    } catch (e) {
      Alert.alert("Create failed", e?.message || "");
    }
  };

  const toggleSelect = (id) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const exportSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      Alert.alert("Nothing selected");
      return;
    }
    try {
      const payload = await exportTemplatesJson(ids);
      const json = JSON.stringify(payload, null, 2);
      const filename = `templates_${ids.length}_${Date.now()}.json`;
      if (Platform.OS === "android")
        setExportPrompt({ visible: true, filename, json, busy: false });
      else {
        const tempUri = FileSystem.cacheDirectory + filename;
        await FileSystem.writeAsStringAsync(tempUri, json, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        if (await Sharing.isAvailableAsync())
          await Sharing.shareAsync(tempUri, { mimeType: "application/json" });
        else Alert.alert("Exported", `Saved to temp: ${tempUri}`);
      }
    } catch (e) {
      Alert.alert("Export failed", e?.message || "");
    }
  };

  const deleteSelected = () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) {
      Alert.alert("Nothing selected");
      return;
    }
    Alert.alert("Delete", `Delete ${ids.length} template(s)?`, [
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
    ]);
  };

  const startImport = async () => {
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
      if (parsed.templates.length === 1) {
        const tpl = parsed.templates[0];
        setNamePrompt({
          visible: true,
          defaultName: tpl.name || "Imported Template",
          error: "",
          onSubmit: async (nm) => {
            try {
              await importTemplateObjectWithName(tpl, nm);
              setNamePrompt({
                visible: false,
                defaultName: "",
                onSubmit: null,
                error: "",
              });
              await load();
              Alert.alert("Imported", nm);
            } catch (err) {
              setNamePrompt((s) => ({
                ...s,
                error: err?.message || "Name must be unique.",
              }));
            }
          },
        });
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
      Alert.alert("Import failed", e?.message || "");
    }
  };

  const renderItem = ({ item }) => {
    const selected = selectedIds.has(item.id);
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
        {selectMode && (
          <TouchableOpacity
            onPress={() => toggleSelect(item.id)}
            style={{ marginRight: 8 }}
          >
            <Ionicons
              name={selected ? "checkbox-outline" : "square-outline"}
              size={22}
              color={selected ? "#0a84ff" : "#999"}
            />
          </TouchableOpacity>
        )}
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
    <SafeAreaView
      style={styles.container}
      edges={["top", "bottom", "left", "right"]}
    >
      {/* Create */}
      <View style={styles.createCard}>
        <Text style={styles.header}>Create Template</Text>
        <View style={styles.row}>
          <View style={styles.fieldWrap}>
            <TextInput
              style={styles.input}
              placeholder="Template name"
              placeholderTextColor="#666"
              value={name}
              onChangeText={setName}
            />
          </View>
          <View style={[styles.fieldWrap, { maxWidth: 90 }]}>
            <TextInput
              style={styles.input}
              placeholder="Weeks"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              value={weeks}
              onChangeText={setWeeks}
            />
          </View>
          <TouchableOpacity
            style={[
              styles.addButton,
              { alignSelf: "flex-end", marginBottom: 2 },
            ]}
            onPress={onCreate}
          >
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Selection header or normal actions */}
      {selectMode ? (
        <View style={styles.selectionHeaderBar}>
          <TouchableOpacity
            onPress={() => {
              if (allSelected) setSelectedIds(new Set());
              else setSelectedIds(new Set(templates.map((t) => t.id)));
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
            onPress={exitSelectMode}
            style={styles.selectionHeaderButtonRight}
          >
            <Text style={styles.selectionHeaderCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.rowButtons}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setSelectMode(true)}
          >
            <Ionicons name="checkmark-done-outline" size={18} color="#0a84ff" />
            <Text style={styles.secondaryButtonText}>Select</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={startImport}
          >
            <Ionicons name="cloud-download-outline" size={18} color="#0a84ff" />
            <Text style={styles.secondaryButtonText}>Import</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={templates}
        keyExtractor={(i) => String(i.id)}
        refreshing={refreshing}
        onRefresh={() => load({ showSpinner: true })}
        renderItem={renderItem}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No templates yet.</Text>
        }
        contentContainerStyle={{ paddingBottom: selectMode ? 140 : 24 }}
        style={{ flex: 1 }}
      />

      {/* Advanced */}
      <View style={styles.footer}>
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
              Alert.alert("Reset Database", "Delete ALL data?", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Reset",
                  style: "destructive",
                  onPress: async () => {
                    await resetDb();
                    await load();
                  },
                },
              ])
            }
          >
            <View style={styles.resetIconWrap}>
              <Ionicons name="refresh-outline" size={20} color="#0a84ff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.resetTitle}>Reset Database</Text>
              <Text style={styles.resetSubtitle}>
                Clears all data and recreates schema.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#6b6b6b" />
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      <NamePromptModal state={namePrompt} setState={setNamePrompt} />
      <TemplateMultiImportModal
        state={multiImport}
        setState={setMultiImport}
        existingNames={templates.map((t) => t.name)}
        onDone={async (ok, fail) => {
          setMultiImport({ visible: false, items: [], busy: false });
          await load();
          Alert.alert(
            "Import complete",
            `Imported ${ok}${fail ? `, ${fail} failed` : ``}`
          );
        }}
      />
      <ExportDestinationModal state={exportPrompt} setState={setExportPrompt} />

      {selectMode && (
        <View style={styles.selectionActionsBar}>
          <Text style={styles.selCountText}>{selectedIds.size} selected</Text>
          <TouchableOpacity
            style={styles.selActionBtn}
            onPress={exportSelected}
            disabled={!selectedIds.size}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={22}
              color={selectedIds.size ? "#0a84ff" : "#bbb"}
            />
            <Text
              style={[
                styles.selActionLabel,
                { color: selectedIds.size ? "#0a84ff" : "#bbb" },
              ]}
            >
              Export
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.selActionBtn}
            onPress={deleteSelected}
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
    </SafeAreaView>
  );
}

// ---------- Modals ----------
function NamePromptModal({ state, setState }) {
  if (!state.visible) return null;
  return (
    <View style={modalStyles.backdrop} pointerEvents="box-none">
      <View style={modalStyles.card}>
        <Text style={{ fontWeight: "700", marginBottom: 8 }}>
          Choose a unique name
        </Text>
        <TextInput
          value={state.defaultName}
          onChangeText={(v) =>
            setState((s) => ({ ...s, defaultName: v, error: "" }))
          }
          placeholder="Template name"
          style={modalStyles.textInput}
        />
        {!!state.error && <Text style={modalStyles.error}>{state.error}</Text>}
        <View style={modalStyles.actionsRow}>
          <TouchableOpacity
            onPress={() =>
              setState({
                visible: false,
                defaultName: "",
                onSubmit: null,
                error: "",
              })
            }
            style={modalStyles.actionBtn}
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => state.onSubmit?.(state.defaultName)}
            style={modalStyles.actionBtn}
          >
            <Text style={{ color: "#0a84ff", fontWeight: "700" }}>Import</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

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
  const toggleSel = (idx) =>
    updateItem(idx, { selected: !items[idx].selected, error: "" });
  const setNm = (idx, nm) => updateItem(idx, { name: nm, error: "" });
  const importAll = async () => {
    if (state.busy) return;
    let hasErr = false;
    const next = items.map((it, idx) => {
      if (!it.selected) return it;
      const err = nameExists(it.name, idx);
      if (err) hasErr = true;
      return { ...it, error: err };
    });
    if (hasErr) {
      setState({ ...state, items: next });
      return;
    }
    setState({ ...state, busy: true });
    let ok = 0,
      fail = 0;
    for (const it of items) {
      if (!it.selected) continue;
      try {
        await importTemplateObjectWithName(it.tpl, it.name.trim());
        ok++;
      } catch {
        fail++;
      }
    }
    setState({ visible: false, items: [], busy: false });
    onDone?.(ok, fail);
  };
  return (
    <View style={modalStyles.backdrop} pointerEvents="box-none">
      <View style={[modalStyles.card, { maxHeight: 520 }]}>
        <View style={modalStyles.sheetHeader}>
          <Text style={{ fontWeight: "700" }}>Import Templates</Text>
          <Text style={modalStyles.sheetSub}>
            Select and name templates to import
          </Text>
        </View>
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          style={{ maxHeight: 380 }}
          renderItem={({ item, index }) => (
            <View style={modalStyles.itemRow}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <TouchableOpacity
                  onPress={() => toggleSel(index)}
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
                onChangeText={(v) => setNm(index, v)}
                placeholder="New unique name"
                style={[
                  modalStyles.textInput,
                  {
                    marginTop: 8,
                    borderColor: item.error ? "#cc0000" : "#ddd",
                  },
                ]}
              />
              {!!item.error && (
                <Text style={modalStyles.error}>{item.error}</Text>
              )}
            </View>
          )}
        />
        <View style={modalStyles.actionsRow}>
          <TouchableOpacity
            disabled={state.busy}
            onPress={() => setState({ visible: false, items: [], busy: false })}
            style={modalStyles.actionBtn}
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={state.busy}
            onPress={importAll}
            style={modalStyles.actionBtn}
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

function ExportDestinationModal({ state, setState }) {
  if (!state.visible || Platform.OS !== "android") return null;
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
        close();
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
      Alert.alert("Saved", filename);
      close();
    } catch (e) {
      Alert.alert("Save failed", e?.message || "");
      setState((s) => ({ ...s, busy: false }));
    }
  };
  return (
    <View style={[modalStyles.backdrop, { justifyContent: "flex-end" }]}>
      <View style={modalStyles.sheet}>
        <View style={modalStyles.sheetHeader}>
          <Text style={{ fontWeight: "700" }}>Export</Text>
          <Text style={modalStyles.sheetSub} numberOfLines={1}>
            {filename}
          </Text>
        </View>
        <TouchableOpacity
          disabled={busy}
          onPress={saveToFolder}
          style={modalStyles.sheetBtn}
        >
          <Ionicons name="folder-outline" size={20} color="#0a84ff" />
          <Text style={{ color: busy ? "#999" : "#0a84ff", fontWeight: "700" }}>
            Save to folder
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          disabled={busy}
          onPress={close}
          style={[modalStyles.sheetBtn, { justifyContent: "center" }]}
        >
          <Text style={{ fontWeight: "600" }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Styles
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#f7f7f7" },
  header: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  fieldWrap: { flex: 1 },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#555",
    marginBottom: 4,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
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
    marginBottom: 12,
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
  emptyText: { textAlign: "center", marginTop: 24, color: "#666" },
  footer: { marginTop: 4 },
  rowButtons: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  secondaryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
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
    marginTop: 8,
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
  selectionHeaderBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
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
    justifyContent: "space-evenly",
    paddingBottom: 20,
    paddingTop: 12,
    backgroundColor: "#ffffffee",
    borderTopWidth: 1,
    borderColor: "#e5e5e5",
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

const modalStyles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    width: "100%",
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 12,
  },
  actionBtn: { paddingVertical: 10, paddingHorizontal: 12 },
  error: { color: "#cc0000", marginTop: 8 },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 12,
    width: "100%",
  },
  sheetHeader: { padding: 16, borderBottomWidth: 1, borderColor: "#eee" },
  sheetSub: { color: "#666", marginTop: 4, fontSize: 12 },
  sheetBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  itemRow: { padding: 12, borderBottomWidth: 1, borderColor: "#f1f1f1" },
});
