import { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { useSync } from "./src/hooks/useSync";
import { Block, generateId, getLogicalDay, isToday } from "./src/lib/types";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = "138168406016-hfd59u7kbqm3vhk0n7sefaveajcmlht3.apps.googleusercontent.com";

export default function App() {
  const {
    isLoggedIn,
    blocks,
    initialized,
    signIn,
    signOut,
    saveBlock,
  } = useSync();

  const [text, setText] = useState("");
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    clientId: GOOGLE_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      signIn(id_token);
    }
  }, [response]);

  useEffect(() => {
    if (initialized && !isLoggedIn) {
      const saved = blocks.map((b) => b.text).join("\n");
      setText(saved);
    } else if (initialized && isLoggedIn) {
      const todayBlocks = blocks.filter((b) => isToday(b.createdAt, 4));
      setText(todayBlocks.map((b) => b.text).join("\n"));
    }
  }, [initialized, isLoggedIn, blocks]);

  const handleSave = async () => {
    const lines = text.split("\n");
    const now = new Date().toISOString();

    for (const line of lines) {
      if (line.trim()) {
        await saveBlock({
          id: generateId(),
          text: line,
          createdAt: now,
          calendarEventId: null,
          position: 0,
          version: 1,
          updatedAt: now,
          deletedAt: null,
        });
      }
    }
  };

  if (!initialized) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <Text style={[styles.text, isDark && styles.textDark]}>loading...</Text>
      </View>
    );
  }

  const pastBlocks = blocks.filter((b) => !isToday(b.createdAt, 4));
  const dayGroups: { day: string; blocks: Block[] }[] = [];
  let currentGroup: { day: string; blocks: Block[] } | null = null;

  for (const block of pastBlocks) {
    const day = getLogicalDay(block.createdAt, 4);
    if (!currentGroup || currentGroup.day !== day) {
      currentGroup = { day, blocks: [block] };
      dayGroups.push(currentGroup);
    } else {
      currentGroup.blocks.push(block);
    }
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, isDark && styles.containerDark]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <StatusBar style={isDark ? "light" : "dark"} />

      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.titleDark]}>znote</Text>
        {isLoggedIn ? (
          <TouchableOpacity onPress={signOut}>
            <Text style={[styles.button, isDark && styles.buttonDark]}>sign out</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity disabled={!request} onPress={() => promptAsync()}>
            <Text style={[styles.button, isDark && styles.buttonDark]}>sign in</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        {dayGroups.map((group) => (
          <View key={group.day} style={styles.dayGroup}>
            <Text style={[styles.dayHeader, isDark && styles.dayHeaderDark]}>
              {group.day}
            </Text>
            {group.blocks.map((block) => (
              <Text key={block.id} style={[styles.blockText, isDark && styles.blockTextDark]}>
                {block.text}
              </Text>
            ))}
          </View>
        ))}

        <View style={styles.dayGroup}>
          <Text style={[styles.dayHeader, isDark && styles.dayHeaderDark]}>
            {getLogicalDay(new Date().toISOString(), 4)}
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.inputContainer, isDark && styles.inputContainerDark]}>
        <TextInput
          style={[styles.input, isDark && styles.inputDark]}
          value={text}
          onChangeText={setText}
          onBlur={handleSave}
          placeholder="start logging..."
          placeholderTextColor={isDark ? "#666" : "#999"}
          multiline
          autoFocus
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  containerDark: {
    backgroundColor: "#0a0a0a",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  title: {
    fontSize: 12,
    color: "#999",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  titleDark: {
    color: "#666",
  },
  button: {
    fontSize: 12,
    color: "#999",
  },
  buttonDark: {
    color: "#666",
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayHeader: {
    fontSize: 12,
    color: "#999",
    marginBottom: 8,
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  dayHeaderDark: {
    color: "#666",
  },
  blockText: {
    fontSize: 14,
    lineHeight: 21,
    color: "#333",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    opacity: 0.5,
  },
  blockTextDark: {
    color: "#f5f5f5",
  },
  inputContainer: {
    borderTopWidth: 1,
    borderTopColor: "#eee",
    padding: 20,
  },
  inputContainerDark: {
    borderTopColor: "#222",
  },
  input: {
    fontSize: 14,
    lineHeight: 21,
    color: "#0a0a0a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    minHeight: 100,
  },
  inputDark: {
    color: "#f5f5f5",
  },
  text: {
    color: "#999",
  },
  textDark: {
    color: "#666",
  },
});
