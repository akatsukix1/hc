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

const STATUS_COLORS: Record<string, string> = {
  complete: Colors.green,
  rejected: Colors.red,
  cancelled: Colors.textMuted,
  open: Colors.yellow,
  "after market order req received": Colors.blue,
  trigger_pending: Colors.yellow,
};

function getStatusColor(status: string): string {
  return STATUS_COLORS[(status || "").toLowerCase()] || Colors.textSecondary;
}

function fmtTime(boeSec: string): string {
  if (!boeSec) return "—";
  try {
    const d = new Date(parseInt(boeSec) * 1000);
    return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  } catch { return boeSec; }
}

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { orders, ordersLoading, refreshOrders, cancelTradeOrder, session } = useKotak();

  useEffect(() => {
    if (session) refreshOrders();
  }, [session]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 0;

  async function handleCancel(orderId: string, symbol: string) {
    Alert.alert("Cancel Order", `Cancel order for ${symbol}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Cancel Order",
        style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          const result = await cancelTradeOrder(orderId);
          Alert.alert(result.success ? "Cancelled" : "Failed", result.message);
          if (result.success) refreshOrders();
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Order Book</Text>
        <View style={styles.headerRight}>
          <Text style={styles.orderCount}>{orders.length} orders</Text>
          <Pressable style={styles.refreshBtn} onPress={refreshOrders}>
            {ordersLoading ? (
              <ActivityIndicator size="small" color={Colors.textSecondary} />
            ) : (
              <Feather name="refresh-cw" size={16} color={Colors.textSecondary} />
            )}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 20 }]}
        scrollEnabled={!!orders.length}
        refreshControl={
          <RefreshControl
            refreshing={ordersLoading}
            onRefresh={refreshOrders}
            tintColor={Colors.green}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="list" size={40} color={Colors.border2} />
            <Text style={styles.emptyText}>No orders today</Text>
          </View>
        }
        renderItem={({ item: o }) => {
          const status = (o.ordSt || o.status || o.orderStatus || "").toLowerCase();
          const isCancellable = ["open", "trigger_pending", "amo req received"].includes(status);
          const isBuy = (o.trnsTp || o.transactionType || "").toUpperCase() === "B";
          const qty = o.qty || o.lotSize || "—";
          const price = o.pr || o.price || o.lmtPrc || "MKT";
          const sym = o.trdSym || o.sym || o.tsym || "—";
          const ordId = o.nOrdNo || o.ordNo || "";

          return (
            <View style={styles.orderCard}>
              <View style={styles.orderTop}>
                <View style={styles.orderLeft}>
                  <View style={[styles.buySellTag, { backgroundColor: isBuy ? `${Colors.green}20` : `${Colors.red}20` }]}>
                    <Text style={[styles.buySellText, { color: isBuy ? Colors.green : Colors.red }]}>
                      {isBuy ? "BUY" : "SELL"}
                    </Text>
                  </View>
                  <Text style={styles.orderSym} numberOfLines={1}>{sym}</Text>
                </View>
                <View style={styles.orderRight}>
                  <View style={[styles.statusBadge, { borderColor: `${getStatusColor(status)}40`, backgroundColor: `${getStatusColor(status)}12` }]}>
                    <Text style={[styles.statusText, { color: getStatusColor(status) }]}>
                      {status.toUpperCase()}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.orderDetails}>
                <ODetail label="Qty" value={String(qty)} />
                <ODetail label="Price" value={String(price)} />
                <ODetail label="Type" value={o.pt || o.prcTp || "MKT"} />
                <ODetail label="Time" value={fmtTime(o.boeSec)} />
              </View>

              <View style={styles.orderBottom}>
                {!!ordId && (
                  <Text style={styles.orderId}>#{ordId}</Text>
                )}
                {isCancellable && (
                  <Pressable
                    style={styles.cancelBtn}
                    onPress={() => handleCancel(ordId, sym)}
                  >
                    <Feather name="x" size={12} color={Colors.red} />
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

function ODetail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.oDetail}>
      <Text style={styles.oDetailLabel}>{label}</Text>
      <Text style={styles.oDetailValue}>{value}</Text>
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
  orderCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  refreshBtn: { padding: 4 },
  list: { padding: 16, gap: 10 },
  orderCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
  },
  orderTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderLeft: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  buySellTag: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  buySellText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  orderSym: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: Colors.text, flex: 1 },
  orderRight: {},
  statusBadge: { borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontFamily: "Inter_600SemiBold", letterSpacing: 0.4 },
  orderDetails: { flexDirection: "row", justifyContent: "space-between" },
  oDetail: { alignItems: "center", flex: 1 },
  oDetailLabel: { fontSize: 10, fontFamily: "Inter_400Regular", color: Colors.textMuted, marginBottom: 2 },
  oDetailValue: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.text },
  orderBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderId: { fontSize: 11, fontFamily: "Inter_400Regular", color: Colors.textMuted },
  cancelBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: `${Colors.red}40`,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
  },
  cancelBtnText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.red },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textMuted },
});
