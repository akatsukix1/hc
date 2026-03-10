import React, { useState, useRef, useEffect } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ActivityIndicator, Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";

export default function TotpScreen() {
  const insets = useSafeAreaInsets();
  const { connectWithTotp, loadingMessage, credentials, clearCredentials } = useKotak();
  const [totp, setTotp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  async function handleConnect() {
    if (totp.length !== 6) { setError("Enter 6-digit TOTP"); return; }
    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await connectWithTotp(totp);
    setLoading(false);
    if (result.status === "success") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace("/(terminal)");
    } else {
      setError(result.message || "Connection failed");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTotp("");
    }
  }

  function handleTotpChange(val: string) {
    const cleaned = val.replace(/\D/g, "").slice(0, 6);
    setTotp(cleaned);
    setError("");
    if (cleaned.length === 6) {
      setTimeout(() => handleConnectRef.current(), 200);
    }
  }

  const handleConnectRef = useRef(handleConnect);
  useEffect(() => { handleConnectRef.current = handleConnect; }, [handleConnect]);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.header}>
        <View style={styles.logoRow}>
          <View style={[styles.logoDot, { backgroundColor: loading ? Colors.yellow : Colors.green }]} />
          <Text style={styles.logoText}>AKATSUKI</Text>
        </View>
        <Text style={styles.title}>Enter TOTP</Text>
        <Text style={styles.subtitle}>
          Open your authenticator app and enter the{"\n"}6-digit code for Kotak Securities
        </Text>
      </View>

      <View style={styles.inputSection}>
        <TextInput
          ref={inputRef}
          style={styles.totpInput}
          value={totp}
          onChangeText={handleTotpChange}
          keyboardType="number-pad"
          maxLength={6}
          placeholder="000000"
          placeholderTextColor={Colors.border2}
          selectionColor={Colors.green}
          caretHidden
        />

        <View style={styles.dots}>
          {[0,1,2,3,4,5].map((i) => (
            <View
              key={i}
              style={[
                styles.dot,
                totp.length > i && styles.dotFilled,
                totp.length === i && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {!!error && (
          <View style={styles.errorBox}>
            <Feather name="alert-circle" size={14} color={Colors.red} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={Colors.green} size="small" />
            <Text style={styles.loadingText}>{loadingMessage || "Connecting..."}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.connectBtn,
            totp.length < 6 && styles.connectBtnDisabled,
            pressed && { opacity: 0.85 },
          ]}
          onPress={handleConnect}
          disabled={loading || totp.length < 6}
        >
          {loading ? (
            <ActivityIndicator color={Colors.bg} size="small" />
          ) : (
            <>
              <Text style={styles.connectBtnText}>Connect</Text>
              <Feather name="arrow-right" size={18} color={Colors.bg} />
            </>
          )}
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={styles.changeCredsBtn}
          onPress={() => { clearCredentials(); router.replace("/setup"); }}
        >
          <Feather name="settings" size={14} color={Colors.textMuted} />
          <Text style={styles.changeCredsText}>Change credentials</Text>
        </Pressable>

        <View style={styles.credInfo}>
          <Feather name="user" size={12} color={Colors.textMuted} />
          <Text style={styles.credInfoText}>UCC: {credentials?.ucc || "—"}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
    paddingHorizontal: 32,
    justifyContent: "space-between",
  },
  header: {
    gap: 12,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  logoText: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: 4,
  },
  title: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  inputSection: {
    alignItems: "center",
    gap: 20,
  },
  totpInput: {
    position: "absolute",
    opacity: 0,
    height: 1,
    width: 1,
  },
  dots: {
    flexDirection: "row",
    gap: 14,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.border2,
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: Colors.green,
    borderColor: Colors.green,
    shadowColor: Colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  dotActive: {
    borderColor: Colors.green,
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${Colors.red}18`,
    borderWidth: 1,
    borderColor: `${Colors.red}40`,
    borderRadius: 10,
    padding: 12,
    width: "100%",
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.red,
    flex: 1,
  },
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
  },
  connectBtn: {
    backgroundColor: Colors.green,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    justifyContent: "center",
  },
  connectBtnDisabled: {
    opacity: 0.4,
  },
  connectBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
  footer: {
    alignItems: "center",
    gap: 12,
  },
  changeCredsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
  },
  changeCredsText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
  credInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  credInfoText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});
