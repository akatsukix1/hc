import { View, ActivityIndicator } from "react-native";
import Colors from "@/constants/colors";

export default function Index() {
  return (
    <View style={{ flex: 1, backgroundColor: Colors.bg, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator color={Colors.green} size="large" />
    </View>
  );
}
