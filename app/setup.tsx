import React, { useState } from "react";
import {
  View, Text, StyleSheet, TextInput, Pressable,
  ScrollView, Platform, ActivityIndicator, KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useKotak } from "@/context/KotakContext";

export default function SetupScreen() {
  const insets = useSafeAreaInsets();
  const { saveCredentials } = useKotak();
  const [accessToken, setAccessToken] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [ucc, setUcc] = useState("");
  const [mpin, setMpin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    if (!accessToken.trim() || !mobileNumber.trim() || !ucc.trim() || !mpin.trim()) {
      setError("All fields are required");
      return;
    }
    if (!/^\+91\d{10}$/.test(mobileNumber.trim()) && !/^\d{10}$/.test(mobileNumber.trim())) {
      setError("Enter mobile as +91XXXXXXXXXX or 10 digits");
      return;
    }
    setError("");
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await saveCredentials({
      accessToken: accessToken.trim(),
      mobileNumber: mobileNumber.trim().startsWith("+") ? mobileNumber.trim() : `+91${mobileNumber.trim()}`,
      ucc: ucc.trim().toUpperCase(),
      mpin: mpin.trim(),
    });
    setLoading(false);
    router.replace("/totp");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: Colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <View style={styles.logoDot} />
            <Text style={styles.logoText}>AKATSUKI</Text>
          </View>
          <Text style={styles.subtitle}>Kotak Securities Setup</Text>
          <Text style={styles.description}>
            Your credentials are stored encrypted on this device only.{"\n"}Nothing is sent to any server.
          </Text>
        </View>

        <View style={styles.form}>
          <Field
            label="API Access Token"
            placeholder="Paste from NEO dashboard → Trade API"
            value={accessToken}
            onChangeText={setAccessToken}
            multiline
            autoCapitalize="none"
          />
          <Field
            label="Mobile Number"
            placeholder="+91XXXXXXXXXX"
            value={mobileNumber}
            onChangeText={setMobileNumber}
            keyboardType="phone-pad"
          />
          <Field
            label="UCC / Client Code"
            placeholder="Your Kotak client code"
            value={ucc}
            onChangeText={setUcc}
            autoCapitalize="characters"
          />
          <Field
            label="6-Digit MPIN"
            placeholder="Your trading MPIN"
            value={mpin}
            onChangeText={setMpin}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
          />

          {!!error && (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color={Colors.red} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.saveBtn, pressed && { opacity: 0.85 }]}
            onPress={handleSave}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={Colors.bg} size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Save & Continue</Text>
            )}
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Feather name="lock" size={12} color={Colors.textMuted} />
          <Text style={styles.footerText}>
            Secured with Android Keystore encryption
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label, placeholder, value, onChangeText, secureTextEntry,
  keyboardType, autoCapitalize, multiline, maxLength,
}: any) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || "default"}
        autoCapitalize={autoCapitalize || "none"}
        autoCorrect={false}
        multiline={multiline}
        maxLength={maxLength}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    gap: 24,
  },
  header: {
    gap: 8,
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.green,
    shadowColor: Colors.green,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  logoText: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: Colors.text,
    letterSpacing: 4,
  },
  subtitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    color: Colors.text,
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  form: {
    gap: 16,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    color: Colors.textSecondary,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  input: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: Colors.text,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: "top",
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: `${Colors.red}18`,
    borderWidth: 1,
    borderColor: `${Colors.red}40`,
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: Colors.red,
    flex: 1,
  },
  saveBtn: {
    backgroundColor: Colors.green,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    marginTop: 4,
  },
  saveBtnText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    color: Colors.bg,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  footerText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    color: Colors.textMuted,
  },
});
