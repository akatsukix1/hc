import React, { useEffect } from "react";
import {
  View, Text, StyleSheet, FlatList, Pressable,
  ActivityIndicator, RefreshControl, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";

function getNetQty(p: any): number {
  const bq = parseInt(p.flBuyQty ?? p.cfBuyQty ?? p.buyQty ?? "0") || 0;
  const sq = parseInt(p.flSellQty ?? p.cfSellQty ?? p.sellQty ?? "0") || 0;
  if (p.netQty !== undefined) return parseInt(p.netQty) || 0;
  return bq - sq;
}

function getPnl(p: any, liveLtps: Record<string, number>): number {
  const ba = parseFloat(p.buyAmt ?? p.cfBuyAmt ?? "0") || 0;
  const sa = parseFloat(p.sellAmt ?? p.cfSellAmt ?? "0") || 0;
  const nq = getNetQty(p);
  if (nq !== 0) {
    const ltp = liveLtps[p.trdSym] || 0;
    if (ltp > 0) {
      return nq > 0 ? ltp * nq - ba + sa : sa - ltp * Math.abs(nq) - ba;
    }
  }
  return typeof p._pnl === "number" ? p._pnl : sa - ba;
}

function fmtPrice(v: number) {
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PositionsScreen() {
  const insets = useSafeAreaInsets();
  const { positions, posLoading, liveLtps, refreshPositions, closeAll, session } = useKotak();

  useEffect(() => {
    if (session) refreshPositions();
  }, [session]);

  const openPositions = positions.filter((p) => getNetQty(p) !== 0);
  const closedPositions = positions.filter((p) => getNetQty(p) === 0);
  const totalPnl = positions.reduce((acc, p) => acc + getPnl(p, liveLtps), 0);

  async function handleCloseAll() {
    Alert.alert("Close All Positions", "This will place market orders to square off all open positions. Confirm?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Close All",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          const result = await closeAll();
          Alert.alert("Done", `Closed ${result.closed} position(s)`);
        },
      },
    ]);
  }

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 0;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Positions</Text>
        <View style={styles.headerRight}>
          {openPositions.length > 0 && (
            <Pressable style={styles.closeAllBtn} onPress={handleCloseAll}>
              <Feather name="x-circle" size={14} color={Colors.red} />
              <Text style={styles.closeAllText}>Close All</Text>
            </Pressable>
          )}
          <Pressable style={styles.refreshBtn} onPress={refreshPositions}>
            {posLoading ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Feather name="refresh-cw" size={16} color={Colors.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>

      <View style={[styles.pnlBanner, { backgroundColor: totalPnl >= 0 ? `${Colors.green}18` : `${Colors.red}18` }]}>
        <Text style={styles.pnlLabel}>Total P&L</Text>
        <Text style={[styles.pnlValue, { color: totalPnl >= 0 ? Colors.green : Colors.red }]}>
          {totalPnl >= 0 ? "+" : ""}₹{fmtPrice(totalPnl)}
        </Text>
      </View>

      <FlatList
        data={positions}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 20 }]}
        scrollEnabled={!!positions.length}
        refreshControl={
          <RefreshControl
            refreshing={posLoading}
            onRefresh={refreshPositions}
            tintColor={Colors.green}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="briefcase" size={40} color={Colors.border2} />
            <Text style={styles.emptyText}>No positions</Text>
          </View>
        }
        renderItem={({ item: p }) => {
          const nq = getNetQty(p);
          const pnl = getPnl(p, liveLtps);
          const ltp = liveLtps[p.trdSym] || 0;
          const isOpen = nq !== 0;
          const buyAvg = parseFloat(p.flBuyAvgPrc ?? p.cfBuyAvgPrc ?? p.buyAvgPrc ?? "0") || 0;
          const sellAvg = parseFloat(p.flSellAvgPrc ?? p.cfSellAvgPrc ?? p.sellAvgPrc ?? "0") || 0;
          const avgPrice = nq > 0 ? buyAvg : sellAvg;

          return (
            <View style={[styles.posCard, !isOpen && styles.posCardClosed]}>
              <View style={styles.posHeader}>
                <View style={styles.posSymbolRow}>
                  <View style={[styles.sideTag, { backgroundColor: nq > 0 ? `${Colors.green}20` : nq < 0 ? `${Colors.red}20` : `${Colors.textMuted}20` }]}>
                    <Text style={[styles.sideTagText, { color: nq > 0 ? Colors.green : nq < 0 ? Colors.red : Colors.textMuted }]}>
                      {nq > 0 ? "LONG" : nq < 0 ? "SHORT" : "CLOSED"}
                    </Text>
                  </View>
                  <Text style={styles.posSymbol} numberOfLines={1}>{p.trdSym || p.sym || "—"}</Text>
                </View>
                <Text style={[styles.posPnl, { color: pnl >= 0 ? Colors.green : Colors.red }]}>
                  {pnl >= 0 ? "+" : ""}₹{fmtPrice(pnl)}
                </Text>
              </View>
              <View style={styles.posDetails}>
                <Detail label="Qty" value={String(Math.abs(nq))} />
                <Detail label="Avg" value={avgPrice > 0 ? fmtPrice(avgPrice) : "—"} />
                <Detail label="LTP" value={ltp > 0 ? fmtPrice(ltp) : "—"} highlight={ltp > 0} />
                <Detail label="Exch" value={p.exSeg || p.seg || "—"} />
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function Detail({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, highlight && { color: Colors.yellow }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: Colors.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  closeAllBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: `${Colors.red}18`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
  },
  closeAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.red },
  refreshBtn: { padding: 4 },
  pnlBanner: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pnlLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.textSecondary },
  pnlValue: { fontSize: 20, fontFamily: "Inter_700Bold" },
  list: { padding: 16, gap: 10 },
  posCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  posCardClosed: { opacity: 0.5 },
  posHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  posSymbolRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  sideTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  sideTagText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  posSymbol: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  posPnl: { fontSize: 16, fontFamily: "Inter_700Bold" },
  posDetails: { flexDirection: "row", justifyContent: "space-between" },
  detail: { alignItems: "center", flex: 1 },
  detailLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 2 },
  detailValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});
