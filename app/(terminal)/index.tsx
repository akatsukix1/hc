import React, { useState } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";
import type { ChainRow } from "@/lib/options-engine";

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX"];

function fmtPrice(v: number): string {
  if (!v) return "—";
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtStrike(v: number): string {
  return v.toLocaleString("en-IN");
}

interface OrderSheetState {
  visible: boolean;
  row: ChainRow | null;
  side: "CE" | "PE" | null;
  action: "B" | "S" | null;
  lots: string;
}

export default function ChainScreen() {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const {
    currentIndex, setCurrentIndex,
    spotPrices, expiries, selectedExpiry, setSelectedExpiry,
    numStrikes, setNumStrikes,
    chain, chainLoading, refreshChain,
    instrumentsLoaded, instrumentsLoading, instrumentsStatus, reloadInstruments,
    placeTradeOrder,
    session,
  } = useKotak();

  const [selectedRow, setSelectedRow] = useState<ChainRow | null>(null);
  const [orderSheet, setOrderSheet] = useState<OrderSheetState>({
    visible: false, row: null, side: null, action: null, lots: "1",
  });
  const [placing, setPlacing] = useState(false);
  const [showIndexPicker, setShowIndexPicker] = useState(false);
  const [showStrikesPicker, setShowStrikesPicker] = useState(false);

  const spot = spotPrices[currentIndex] || chain?.spotPrice || 0;
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;

  // Bottom: tab bar + action bar (72px) + safety gap
  const ACTION_BAR_H = 72;
  const listBottomPad = tabBarHeight + ACTION_BAR_H + 8;
  // Web: account for web bottom inset too
  const webExtra = Platform.OS === "web" ? 34 : 0;

  function selectRow(row: ChainRow) {
    Haptics.selectionAsync();
    setSelectedRow((prev) => (prev?.strike === row.strike ? null : row));
  }

  function openOrderSheet(row: ChainRow, side: "CE" | "PE", action: "B" | "S") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setOrderSheet({ visible: true, row, side, action, lots: "1" });
  }

  function closeOrderSheet() {
    setOrderSheet({ visible: false, row: null, side: null, action: null, lots: "1" });
  }

  function handleActionBtn(side: "CE" | "PE", action: "B" | "S") {
    if (!selectedRow) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      Alert.alert("Select a strike", "Tap any row in the chain to select a strike first.");
      return;
    }
    openOrderSheet(selectedRow, side, action);
  }

  async function handlePlaceOrder() {
    const { row, side, action, lots } = orderSheet;
    if (!row || !side || !action) return;
    const lotsNum = parseInt(lots) || 1;
    const ts = side === "CE" ? row.ce_ts : row.pe_ts;
    const es = side === "CE" ? row.ce_seg : row.pe_seg;
    const lot = side === "CE" ? row.ce_lot : row.pe_lot;
    if (!ts || !es) { Alert.alert("Error", "No instrument data for this strike"); return; }
    const qty = lotsNum * lot;
    setPlacing(true);
    const result = await placeTradeOrder({ es, ts, tt: action, qty });
    setPlacing(false);
    closeOrderSheet();
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Order Placed", result.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert("Order Failed", result.message);
    }
  }

  if (!session) {
    return (
      <View style={[styles.container, { paddingTop: topPad, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={Colors.green} size="large" />
      </View>
    );
  }

  const actionBarBottom = tabBarHeight + webExtra;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable style={styles.indexSelector} onPress={() => setShowIndexPicker(true)}>
            <Text style={styles.indexText}>{currentIndex}</Text>
            <Feather name="chevron-down" size={14} color={Colors.textSecondary} />
          </Pressable>
          <View style={styles.spotBox}>
            <View style={[styles.liveDot, { backgroundColor: spot > 0 ? Colors.green : Colors.textMuted }]} />
            <Text style={styles.spotPrice}>{spot > 0 ? fmtPrice(spot) : "—"}</Text>
          </View>
          <Pressable style={styles.refreshBtn} onPress={refreshChain}>
            {chainLoading
              ? <ActivityIndicator size="small" color={Colors.textSecondary} />
              : <Feather name="refresh-cw" size={15} color={Colors.textSecondary} />
            }
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.expiryRow}>
          {expiries.map((e) => (
            <Pressable
              key={e.label}
              style={[styles.expiryChip, selectedExpiry === e.label && styles.expiryChipActive]}
              onPress={() => { Haptics.selectionAsync(); setSelectedExpiry(e.label); }}
            >
              <Text style={[styles.expiryText, selectedExpiry === e.label && styles.expiryTextActive]}>
                {e.label}
              </Text>
              {e.isNearest && <View style={styles.nearestDot} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.chainHeader}>
          <Text style={[styles.colHeader, { textAlign: "left", paddingLeft: 12 }]}>CE</Text>
          <View style={styles.strikeHeaderBox}>
            <Pressable onPress={() => setShowStrikesPicker(true)}>
              <Text style={styles.strikeHeaderText}>STRIKE ±{numStrikes}</Text>
            </Pressable>
          </View>
          <Text style={[styles.colHeader, { textAlign: "right", paddingRight: 12 }]}>PE</Text>
        </View>
      </View>

      {/* Chain list */}
      {chainLoading && !chain ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.green} size="large" />
          <Text style={styles.loadingText}>Building options chain...</Text>
        </View>
      ) : !instrumentsLoaded ? (
        <View style={styles.loadingBox}>
          <Feather name="download" size={40} color={Colors.border2} />
          <Text style={styles.emptyText}>Instruments not loaded</Text>
          <Text style={styles.emptySubText}>CSV download failed on login</Text>
          <Pressable
            style={[styles.retryBtn, instrumentsLoading && { opacity: 0.5 }]}
            onPress={reloadInstruments}
            disabled={instrumentsLoading}
          >
            {instrumentsLoading
              ? <ActivityIndicator color={Colors.bg} size="small" />
              : <Text style={styles.retryBtnText}>Download Instruments</Text>
            }
          </Pressable>
          {!!instrumentsStatus && (
            <Text style={styles.statusText}>{instrumentsStatus}</Text>
          )}
        </View>
      ) : !chain || !chain.chain.length ? (
        <View style={styles.loadingBox}>
          <Feather name="bar-chart-2" size={40} color={Colors.border2} />
          <Text style={styles.emptyText}>No chain data</Text>
          <Text style={styles.emptySubText}>Tap refresh or select an expiry</Text>
        </View>
      ) : (
        <FlatList
          data={chain.chain}
          keyExtractor={(item) => String(item.strike)}
          contentContainerStyle={{ paddingBottom: listBottomPad }}
          initialScrollIndex={Math.floor(chain.chain.length / 2)}
          getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
          renderItem={({ item }) => (
            <ChainRowItem
              item={item}
              isAtm={item.isAtm}
              isSelected={selectedRow?.strike === item.strike}
              onPress={() => selectRow(item)}
            />
          )}
        />
      )}

      {/* Fixed bottom action bar */}
      <View style={[styles.actionBar, { bottom: actionBarBottom }]}>
        <View style={styles.actionBarInfo}>
          {selectedRow ? (
            <>
              <Text style={styles.actionBarStrike}>{fmtStrike(selectedRow.strike)}</Text>
              <Text style={styles.actionBarExpiry}>{selectedExpiry}</Text>
            </>
          ) : (
            <Text style={styles.actionBarHint}>↑  Tap a row to select strike</Text>
          )}
        </View>
        <View style={styles.actionBtns}>
          <Pressable
            style={[styles.actionBtn, styles.buyCeBtn, !selectedRow && styles.actionBtnDisabled]}
            onPress={() => handleActionBtn("CE", "B")}
          >
            <Text style={styles.actionBtnText}>B CE</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.sellCeBtn, !selectedRow && styles.actionBtnDisabled]}
            onPress={() => handleActionBtn("CE", "S")}
          >
            <Text style={styles.actionBtnText}>S CE</Text>
          </Pressable>
          <View style={styles.actionDivider} />
          <Pressable
            style={[styles.actionBtn, styles.buyPeBtn, !selectedRow && styles.actionBtnDisabled]}
            onPress={() => handleActionBtn("PE", "B")}
          >
            <Text style={styles.actionBtnText}>B PE</Text>
          </Pressable>
          <Pressable
            style={[styles.actionBtn, styles.sellPeBtn, !selectedRow && styles.actionBtnDisabled]}
            onPress={() => handleActionBtn("PE", "S")}
          >
            <Text style={styles.actionBtnText}>S PE</Text>
          </Pressable>
        </View>
      </View>

      {/* Index picker */}
      <Modal visible={showIndexPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowIndexPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>SELECT INDEX</Text>
            {INDICES.map((idx) => (
              <Pressable
                key={idx}
                style={[styles.pickerItem, currentIndex === idx && styles.pickerItemActive]}
                onPress={() => { Haptics.selectionAsync(); setCurrentIndex(idx); setShowIndexPicker(false); }}
              >
                <Text style={[styles.pickerItemText, currentIndex === idx && styles.pickerItemTextActive]}>{idx}</Text>
                {currentIndex === idx && <Feather name="check" size={16} color={Colors.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Strikes picker */}
      <Modal visible={showStrikesPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowStrikesPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>STRIKES EACH SIDE</Text>
            {[3, 5, 7, 10, 15].map((n) => (
              <Pressable
                key={n}
                style={[styles.pickerItem, numStrikes === n && styles.pickerItemActive]}
                onPress={() => { Haptics.selectionAsync(); setNumStrikes(n); setShowStrikesPicker(false); }}
              >
                <Text style={[styles.pickerItemText, numStrikes === n && styles.pickerItemTextActive]}>±{n} strikes</Text>
                {numStrikes === n && <Feather name="check" size={16} color={Colors.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Order confirmation sheet */}
      <Modal visible={orderSheet.visible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeOrderSheet} />
          <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />

            {/* Title row */}
            <View style={styles.sheetTitleRow}>
              <View style={[
                styles.sheetActionBadge,
                { backgroundColor: orderSheet.action === "B" ? Colors.green : Colors.red },
              ]}>
                <Text style={styles.sheetActionBadgeText}>
                  {orderSheet.action === "B" ? "BUY" : "SELL"}
                </Text>
              </View>
              <View>
                <Text style={styles.sheetStrike}>
                  {orderSheet.row ? fmtStrike(orderSheet.row.strike) : ""} {orderSheet.side}
                </Text>
                <Text style={styles.sheetSymbol}>
                  {orderSheet.side === "CE" ? orderSheet.row?.ce_ts : orderSheet.row?.pe_ts}
                </Text>
              </View>
            </View>

            {/* Lots control */}
            <View style={styles.sheetLotsRow}>
              <Text style={styles.sheetLotsLabel}>Lots</Text>
              <View style={styles.sheetLotsControl}>
                <Pressable
                  style={styles.lotsBtn}
                  onPress={() => {
                    const v = Math.max(1, parseInt(orderSheet.lots || "1") - 1);
                    setOrderSheet((s) => ({ ...s, lots: String(v) }));
                  }}
                >
                  <Feather name="minus" size={20} color={Colors.text} />
                </Pressable>
                <TextInput
                  style={styles.lotsInput}
                  value={orderSheet.lots}
                  onChangeText={(v) => setOrderSheet((s) => ({ ...s, lots: v.replace(/\D/g, "") || "1" }))}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <Pressable
                  style={styles.lotsBtn}
                  onPress={() => {
                    const v = parseInt(orderSheet.lots || "1") + 1;
                    setOrderSheet((s) => ({ ...s, lots: String(v) }));
                  }}
                >
                  <Feather name="plus" size={20} color={Colors.text} />
                </Pressable>
              </View>
            </View>

            {/* Qty info */}
            <View style={styles.sheetQtyInfo}>
              <Text style={styles.sheetQtyText}>
                {orderSheet.lots} lot{parseInt(orderSheet.lots || "1") !== 1 ? "s" : ""} ×{" "}
                {orderSheet.side === "CE" ? orderSheet.row?.ce_lot : orderSheet.row?.pe_lot} ={" "}
                <Text style={styles.sheetQtyBold}>
                  {(parseInt(orderSheet.lots || "1") || 1) *
                    (orderSheet.side === "CE" ? (orderSheet.row?.ce_lot || 1) : (orderSheet.row?.pe_lot || 1))} qty
                </Text>
              </Text>
              <Text style={styles.sheetProdText}>MIS · MARKET</Text>
            </View>

            {/* Confirm / Cancel */}
            <View style={styles.sheetActions}>
              <Pressable style={styles.sheetCancelBtn} onPress={closeOrderSheet}>
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.sheetConfirmBtn,
                  { backgroundColor: orderSheet.action === "B" ? Colors.green : Colors.red },
                  placing && { opacity: 0.6 },
                ]}
                onPress={handlePlaceOrder}
                disabled={placing}
              >
                {placing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.sheetConfirmText}>
                      {orderSheet.action === "B" ? "BUY" : "SELL"} NOW
                    </Text>
                }
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChainRowItem({
  item, isAtm, isSelected, onPress,
}: {
  item: ChainRow;
  isAtm: boolean;
  isSelected: boolean;
  onPress: () => void;
}) {
  const hasCe = !!item.ce_ts;
  const hasPe = !!item.pe_ts;

  return (
    <Pressable
      style={[
        styles.chainRow,
        isAtm && styles.chainRowAtm,
        isSelected && styles.chainRowSelected,
      ]}
      onPress={onPress}
      android_ripple={{ color: `${Colors.blue}20` }}
    >
      {/* CE indicator */}
      <View style={styles.ceSide}>
        {hasCe
          ? <View style={styles.ceBar} />
          : <View style={styles.noInstrument} />
        }
      </View>

      {/* Strike */}
      <View style={[styles.strikeBadge, isAtm && styles.strikeBadgeAtm, isSelected && styles.strikeBadgeSelected]}>
        <Text style={[styles.strikeText, isAtm && styles.strikeTextAtm, isSelected && styles.strikeTextSelected]}>
          {fmtStrike(item.strike)}
        </Text>
        {isAtm && !isSelected && <Text style={styles.atmLabel}>ATM</Text>}
        {isSelected && <Text style={styles.selectedLabel}>SELECTED</Text>}
      </View>

      {/* PE indicator */}
      <View style={styles.peSide}>
        {hasPe
          ? <View style={styles.peBar} />
          : <View style={styles.noInstrument} />
        }
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },

  // Header
  header: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.bg,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  indexSelector: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: Colors.surface,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  indexText: { fontSize: 15, fontFamily: "Inter_700Bold", color: Colors.text },
  spotBox: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  liveDot: { width: 7, height: 7, borderRadius: 3.5 },
  spotPrice: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  refreshBtn: { padding: 6 },
  expiryRow: { paddingHorizontal: 12, paddingBottom: 10 },
  expiryChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    backgroundColor: Colors.surface,
  },
  expiryChipActive: { backgroundColor: `${Colors.blue}20`, borderColor: Colors.blue },
  expiryText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  expiryTextActive: { color: Colors.blue },
  nearestDot: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: Colors.yellow },
  chainHeader: {
    flexDirection: "row",
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bg2,
  },
  colHeader: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 1,
  },
  strikeHeaderBox: { width: 96, alignItems: "center" },
  strikeHeaderText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 0.5,
  },

  // States
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyText: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  emptySubText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginTop: 4 },
  retryBtn: {
    marginTop: 16,
    backgroundColor: Colors.blue,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 180,
    alignItems: "center",
  },
  retryBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.bg },
  statusText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 8,
    textAlign: "center",
    paddingHorizontal: 24,
  },

  // Chain row
  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.border}80`,
  },
  chainRowAtm: { backgroundColor: `${Colors.blue}08` },
  chainRowSelected: { backgroundColor: `${Colors.yellow}15` },
  ceSide: { flex: 1, alignItems: "flex-end", paddingRight: 16 },
  peSide: { flex: 1, alignItems: "flex-start", paddingLeft: 16 },
  ceBar: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: `${Colors.green}60`,
  },
  peBar: {
    width: 40,
    height: 6,
    borderRadius: 3,
    backgroundColor: `${Colors.red}60`,
  },
  noInstrument: { width: 40, height: 6 },
  strikeBadge: {
    width: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 4,
  },
  strikeBadgeAtm: {
    backgroundColor: `${Colors.blue}15`,
    borderRadius: 6,
  },
  strikeBadgeSelected: {
    backgroundColor: `${Colors.yellow}25`,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: `${Colors.yellow}60`,
  },
  strikeText: { fontSize: 13, fontFamily: "Inter_700Bold", color: Colors.textSecondary },
  strikeTextAtm: { color: Colors.blue },
  strikeTextSelected: { color: Colors.yellow },
  atmLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: Colors.blue, letterSpacing: 0.5 },
  selectedLabel: { fontSize: 9, fontFamily: "Inter_700Bold", color: Colors.yellow, letterSpacing: 0.5 },

  // Fixed action bar
  actionBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 72,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  actionBarInfo: {
    flex: 1,
    justifyContent: "center",
  },
  actionBarStrike: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.yellow,
  },
  actionBarExpiry: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    marginTop: 1,
  },
  actionBarHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  actionBtns: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  actionDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },
  actionBtn: {
    width: 52,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: { opacity: 0.35 },
  buyCeBtn: { backgroundColor: Colors.green },
  sellCeBtn: { backgroundColor: `${Colors.green}40`, borderWidth: 1, borderColor: Colors.green },
  buyPeBtn: { backgroundColor: Colors.red },
  sellPeBtn: { backgroundColor: `${Colors.red}40`, borderWidth: 1, borderColor: Colors.red },
  actionBtnText: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#fff" },

  // Pickers
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  pickerCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 6,
    width: 240,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pickerTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 1,
    padding: 12,
    paddingBottom: 8,
  },
  pickerItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  pickerItemActive: { backgroundColor: `${Colors.green}15` },
  pickerItemText: { fontSize: 15, fontFamily: "Inter_500Medium", color: Colors.text },
  pickerItemTextActive: { color: Colors.green, fontFamily: "Inter_600SemiBold" },

  // Order sheet
  sheetOverlay: { flex: 1, justifyContent: "flex-end" },
  sheetBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
  sheetCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    borderTopWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border2,
    alignSelf: "center",
    marginBottom: 4,
  },
  sheetTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  sheetActionBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    minWidth: 64,
    alignItems: "center",
  },
  sheetActionBadgeText: {
    fontSize: 15,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    letterSpacing: 1,
  },
  sheetStrike: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  sheetSymbol: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    marginTop: 2,
  },
  sheetLotsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.bg2,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sheetLotsLabel: { fontSize: 14, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  sheetLotsControl: { flexDirection: "row", alignItems: "center", gap: 16 },
  lotsBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
  },
  lotsInput: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    minWidth: 48,
    textAlign: "center",
  },
  sheetQtyInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 2,
  },
  sheetQtyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sheetQtyBold: { fontFamily: "Inter_600SemiBold", color: Colors.text },
  sheetProdText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textMuted },
  sheetActions: { flexDirection: "row", gap: 12 },
  sheetCancelBtn: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    backgroundColor: Colors.bg2,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetCancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.textSecondary },
  sheetConfirmBtn: {
    flex: 2,
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetConfirmText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#fff", letterSpacing: 0.5 },
});
