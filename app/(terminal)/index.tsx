import React, { useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable, ScrollView,
  ActivityIndicator, Modal, TextInput, Platform, Alert,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";
import type { ChainRow } from "@/lib/options-engine";

const INDICES = ["NIFTY", "BANKNIFTY", "SENSEX", "FINNIFTY"];

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
  const {
    currentIndex, setCurrentIndex,
    spotPrices, expiries, selectedExpiry, setSelectedExpiry,
    numStrikes, setNumStrikes,
    chain, chainLoading, refreshChain,
    placeTradeOrder,
    session,
  } = useKotak();

  const [orderSheet, setOrderSheet] = useState<OrderSheetState>({
    visible: false, row: null, side: null, action: null, lots: "1",
  });
  const [placing, setPlacing] = useState(false);
  const [showIndexPicker, setShowIndexPicker] = useState(false);
  const [showStrikesPicker, setShowStrikesPicker] = useState(false);

  const spot = spotPrices[currentIndex] || chain?.spotPrice || 0;
  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 0;

  function openOrderSheet(row: ChainRow, side: "CE" | "PE", action: "B" | "S") {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOrderSheet({ visible: true, row, side, action, lots: "1" });
  }

  function closeOrderSheet() {
    setOrderSheet({ visible: false, row: null, side: null, action: null, lots: "1" });
  }

  async function handlePlaceOrder() {
    const { row, side, action, lots } = orderSheet;
    if (!row || !side || !action) return;
    const lotsNum = parseInt(lots) || 1;
    const ts = side === "CE" ? row.ce_ts : row.pe_ts;
    const es = side === "CE" ? row.ce_seg : row.pe_seg;
    const lot = side === "CE" ? row.ce_lot : row.pe_lot;
    if (!ts || !es) { Alert.alert("Error", "No instrument data"); return; }
    const qty = lotsNum * lot;
    setPlacing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
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
            {chainLoading ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Feather name="refresh-cw" size={15} color={Colors.textSecondary} />
            )}
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.expiryRow}>
          {expiries.map((e) => (
            <Pressable
              key={e.label}
              style={[styles.expiryChip, selectedExpiry === e.label && styles.expiryChipActive]}
              onPress={() => {
                Haptics.selectionAsync();
                setSelectedExpiry(e.label);
              }}
            >
              <Text style={[styles.expiryText, selectedExpiry === e.label && styles.expiryTextActive]}>
                {e.label}
              </Text>
              {e.isNearest && <View style={styles.nearestDot} />}
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.chainHeader}>
          <Text style={[styles.colHeader, { textAlign: "right" }]}>CE</Text>
          <View style={styles.strikeHeaderBox}>
            <Pressable onPress={() => setShowStrikesPicker(true)}>
              <Text style={styles.strikeHeaderText}>Strike ±{numStrikes}</Text>
            </Pressable>
          </View>
          <Text style={[styles.colHeader, { textAlign: "left" }]}>PE</Text>
        </View>
      </View>

      {/* Chain */}
      {chainLoading && !chain ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator color={Colors.green} size="large" />
          <Text style={styles.loadingText}>Building options chain...</Text>
        </View>
      ) : !chain || !chain.chain.length ? (
        <View style={styles.loadingBox}>
          <Feather name="bar-chart-2" size={40} color={Colors.border2} />
          <Text style={styles.emptyText}>No chain data</Text>
        </View>
      ) : (
        <FlatList
          data={chain.chain}
          keyExtractor={(item) => String(item.strike)}
          contentContainerStyle={{ paddingBottom: bottomPad + 20 }}
          initialScrollIndex={Math.floor(chain.chain.length / 2)}
          getItemLayout={(_, index) => ({ length: 52, offset: 52 * index, index })}
          renderItem={({ item }) => (
            <ChainRowItem
              item={item}
              isAtm={item.isAtm}
              onPressCe={(action) => openOrderSheet(item, "CE", action)}
              onPressPe={(action) => openOrderSheet(item, "PE", action)}
            />
          )}
        />
      )}

      {/* Index picker modal */}
      <Modal visible={showIndexPicker} transparent animationType="fade">
        <Pressable style={styles.modalOverlay} onPress={() => setShowIndexPicker(false)}>
          <View style={styles.pickerCard}>
            <Text style={styles.pickerTitle}>Select Index</Text>
            {INDICES.map((idx) => (
              <Pressable
                key={idx}
                style={[styles.pickerItem, currentIndex === idx && styles.pickerItemActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setCurrentIndex(idx);
                  setShowIndexPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, currentIndex === idx && styles.pickerItemTextActive]}>
                  {idx}
                </Text>
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
            <Text style={styles.pickerTitle}>Strikes on each side</Text>
            {[3, 5, 7, 10].map((n) => (
              <Pressable
                key={n}
                style={[styles.pickerItem, numStrikes === n && styles.pickerItemActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setNumStrikes(n);
                  setShowStrikesPicker(false);
                }}
              >
                <Text style={[styles.pickerItemText, numStrikes === n && styles.pickerItemTextActive]}>
                  ±{n} strikes
                </Text>
                {numStrikes === n && <Feather name="check" size={16} color={Colors.green} />}
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>

      {/* Order sheet */}
      <Modal visible={orderSheet.visible} transparent animationType="slide">
        <View style={styles.sheetOverlay}>
          <Pressable style={styles.sheetBackdrop} onPress={closeOrderSheet} />
          <View style={[styles.sheetCard, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>
              {orderSheet.action === "B" ? "BUY" : "SELL"} {orderSheet.side}{" "}
              {orderSheet.row ? fmtStrike(orderSheet.row.strike) : ""}
            </Text>
            <Text style={styles.sheetSymbol}>
              {orderSheet.side === "CE" ? orderSheet.row?.ce_ts : orderSheet.row?.pe_ts}
            </Text>

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
                  <Feather name="minus" size={18} color={Colors.text} />
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
                  <Feather name="plus" size={18} color={Colors.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.sheetQtyInfo}>
              <Text style={styles.sheetQtyText}>
                {orderSheet.lots} lot × {orderSheet.side === "CE" ? orderSheet.row?.ce_lot : orderSheet.row?.pe_lot} = {" "}
                <Text style={styles.sheetQtyBold}>
                  {(parseInt(orderSheet.lots || "1") || 1) * (orderSheet.side === "CE" ? (orderSheet.row?.ce_lot || 1) : (orderSheet.row?.pe_lot || 1))} qty
                </Text>
              </Text>
              <Text style={styles.sheetProdText}>Product: MIS · Type: MARKET</Text>
            </View>

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
                {placing ? (
                  <ActivityIndicator color={Colors.bg} size="small" />
                ) : (
                  <Text style={styles.sheetConfirmText}>
                    {orderSheet.action === "B" ? "BUY" : "SELL"} NOW
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ChainRowItem({
  item, isAtm, onPressCe, onPressPe,
}: {
  item: ChainRow;
  isAtm: boolean;
  onPressCe: (a: "B" | "S") => void;
  onPressPe: (a: "B" | "S") => void;
}) {
  const [ceLong, setCeLong] = useState(false);
  const [peLong, setPeLong] = useState(false);

  return (
    <View style={[styles.chainRow, isAtm && styles.chainRowAtm]}>
      {/* CE side */}
      <Pressable
        style={[styles.ceSide, ceLong && styles.sideContextMenu]}
        onPress={() => onPressCe("B")}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressCe("S");
        }}
      >
        <Text style={[styles.cePrice, !item.ce_ts && styles.priceEmpty]}>
          {item.ce_ts ? "—" : "—"}
        </Text>
        <View style={styles.sideBtns}>
          <TouchableOpacity style={styles.buyBtn} onPress={() => onPressCe("B")} activeOpacity={0.7}>
            <Text style={styles.buyBtnText}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sellBtn} onPress={() => onPressCe("S")} activeOpacity={0.7}>
            <Text style={styles.sellBtnText}>S</Text>
          </TouchableOpacity>
        </View>
      </Pressable>

      {/* Strike */}
      <View style={[styles.strikeBadge, isAtm && styles.strikeBadgeAtm]}>
        <Text style={[styles.strikeText, isAtm && styles.strikeTextAtm]}>
          {fmtStrike(item.strike)}
        </Text>
        {isAtm && <Text style={styles.atmLabel}>ATM</Text>}
      </View>

      {/* PE side */}
      <Pressable
        style={styles.peSide}
        onPress={() => onPressPe("B")}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onPressPe("S");
        }}
      >
        <View style={styles.sideBtns}>
          <TouchableOpacity style={styles.buyBtn} onPress={() => onPressPe("B")} activeOpacity={0.7}>
            <Text style={styles.buyBtnText}>B</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sellBtn} onPress={() => onPressPe("S")} activeOpacity={0.7}>
            <Text style={styles.sellBtnText}>S</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.pePrice, !item.pe_ts && styles.priceEmpty]}>
          {item.pe_ts ? "—" : "—"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
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
  spotBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  spotPrice: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  refreshBtn: { padding: 6 },
  expiryRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
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
  expiryChipActive: {
    backgroundColor: `${Colors.blue}20`,
    borderColor: Colors.blue,
  },
  expiryText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  expiryTextActive: { color: Colors.blue },
  nearestDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: Colors.yellow,
  },
  chainHeader: {
    flexDirection: "row",
    paddingHorizontal: 12,
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
  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  chainRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.border}80`,
  },
  chainRowAtm: {
    backgroundColor: `${Colors.blue}10`,
    borderBottomColor: Colors.border,
  },
  ceSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingRight: 8,
    gap: 6,
    height: "100%",
  },
  peSide: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingLeft: 8,
    gap: 6,
    height: "100%",
  },
  sideContextMenu: { backgroundColor: `${Colors.blue}10` },
  cePrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.green,
    minWidth: 48,
    textAlign: "right",
  },
  pePrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    color: Colors.red,
    minWidth: 48,
  },
  priceEmpty: { color: Colors.textMuted },
  sideBtns: { flexDirection: "row", gap: 4 },
  buyBtn: {
    backgroundColor: `${Colors.green}20`,
    borderWidth: 1,
    borderColor: `${Colors.green}50`,
    borderRadius: 5,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  sellBtn: {
    backgroundColor: `${Colors.red}20`,
    borderWidth: 1,
    borderColor: `${Colors.red}50`,
    borderRadius: 5,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  buyBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.green },
  sellBtnText: { fontSize: 11, fontFamily: "Inter_700Bold", color: Colors.red },
  strikeBadge: {
    width: 96,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
  },
  strikeBadgeAtm: {
    backgroundColor: `${Colors.blue}15`,
    borderRadius: 6,
    paddingVertical: 3,
  },
  strikeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: Colors.textSecondary,
  },
  strikeTextAtm: { color: Colors.blue },
  atmLabel: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    color: Colors.blue,
    letterSpacing: 0.5,
  },
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
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 0.8,
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
  sheetTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    textAlign: "center",
  },
  sheetSymbol: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    textAlign: "center",
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
  sheetLotsLabel: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: Colors.textSecondary,
  },
  sheetLotsControl: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  lotsBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: Colors.surface3,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  lotsInput: {
    width: 52,
    textAlign: "center",
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    borderBottomWidth: 2,
    borderBottomColor: Colors.border2,
    paddingVertical: 2,
  },
  sheetQtyInfo: { alignItems: "center", gap: 4 },
  sheetQtyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  sheetQtyBold: { fontFamily: "Inter_700Bold", color: Colors.text },
  sheetProdText: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  sheetActions: { flexDirection: "row", gap: 12 },
  sheetCancelBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  sheetCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
  },
  sheetConfirmBtn: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  sheetConfirmText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: Colors.bg,
    letterSpacing: 1,
  },
});
