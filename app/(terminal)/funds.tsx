import React, { useEffect } from "react";
import {
  View, Text, StyleSheet, ScrollView,
  Pressable, ActivityIndicator, Platform, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";

function fmtCurrency(v: string): string {
  if (!v || v === "--") return "—";
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function FundsScreen() {
  const insets = useSafeAreaInsets();
  const { funds, fundsLoading, refreshFunds, session, disconnect, credentials } = useKotak();

  useEffect(() => {
    if (session) refreshFunds();
  }, [session]);

  const topPad = Platform.OS === "web" ? insets.top + 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 84 : 0;

  async function handleDisconnect() {
    Alert.alert("Disconnect", "End trading session? You'll need to enter TOTP again to reconnect.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Disconnect",
        style: "destructive",
        onPress: () => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          disconnect();
          router.replace("/totp");
        },
      },
    ]);
  }

  const loginTime = session?.loginTime
    ? new Date(session.loginTime).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
    : "—";

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Funds & Session</Text>
        <Pressable style={styles.refreshBtn} onPress={refreshFunds}>
          {fundsLoading ? (
            <ActivityIndicator size="small" color={Colors.textSecondary} />
          ) : (
            <Feather name="refresh-cw" size={16} color={Colors.textSecondary} />
          )}
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>MARGIN</Text>
        <View style={styles.card}>
          <FundRow
            label="Available"
            value={fmtCurrency(funds.available)}
            valueColor={Colors.green}
            icon="trending-up"
          />
          <View style={styles.divider} />
          <FundRow
            label="Used"
            value={fmtCurrency(funds.used)}
            valueColor={Colors.yellow}
            icon="activity"
          />
          <View style={styles.divider} />
          <FundRow
            label="Collateral"
            value={fmtCurrency(funds.collateral)}
            valueColor={Colors.blue}
            icon="shield"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>SESSION</Text>
        <View style={styles.card}>
          <FundRow label="User" value={session?.greetingName || credentials?.ucc || "—"} icon="user" />
          <View style={styles.divider} />
          <FundRow label="UCC" value={credentials?.ucc || "—"} icon="key" />
          <View style={styles.divider} />
          <FundRow label="Login Time" value={loginTime} icon="clock" />
          <View style={styles.divider} />
          <FundRow label="Status" value="CONNECTED" valueColor={Colors.green} icon="wifi" />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACTIONS</Text>
        <Pressable
          style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.8 }]}
          onPress={handleDisconnect}
        >
          <Feather name="log-out" size={16} color={Colors.red} />
          <Text style={styles.disconnectText}>Disconnect Session</Text>
        </Pressable>
      </View>

      <View style={styles.disclaimer}>
        <Feather name="lock" size={12} color={Colors.textMuted} />
        <Text style={styles.disclaimerText}>
          All data is processed locally. Credentials stored in Android Keystore.
        </Text>
      </View>
    </ScrollView>
  );
}

function FundRow({ label, value, valueColor, icon }: {
  label: string; value: string; valueColor?: string; icon: string;
}) {
  return (
    <View style={styles.fundRow}>
      <View style={styles.fundRowLeft}>
        <Feather name={icon as any} size={14} color={Colors.textMuted} />
        <Text style={styles.fundLabel}>{label}</Text>
      </View>
      <Text style={[styles.fundValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
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
  refreshBtn: { padding: 4 },
  section: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  sectionTitle: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textMuted,
    letterSpacing: 1.2,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  fundRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  fundRowLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  fundLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: Colors.textSecondary },
  fundValue: { fontSize: 16, fontFamily: "Inter_700Bold", color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginHorizontal: 16 },
  disconnectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: `${Colors.red}15`,
    borderWidth: 1,
    borderColor: `${Colors.red}30`,
    borderRadius: 14,
    paddingVertical: 16,
  },
  disconnectText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.red },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  disclaimerText: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
    textAlign: "center",
    flex: 1,
  },
});
