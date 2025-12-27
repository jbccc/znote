import { useState, useEffect, useRef } from "react";
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
import { MarkdownLine } from "./src/components/MarkdownLine";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_IOS_CLIENT_ID = "138168406016-040lmt9q5ok83gkq2af2fq76n06p7le3.apps.googleusercontent.com";

export default function App() {
  const {
    isLoggedIn,
    blocks,
    initialized,
    signIn,
    signOut,
    saveBlock,
    deleteBlock,
  } = useSync();

  const [text, setText] = useState("");
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const scrollViewRef = useRef<ScrollView>(null);
  const todayBlockIdsRef = useRef<string[]>([]);
  const lastSavedTextRef = useRef<string>("");
  const hasScrolledRef = useRef(false);

  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === "success") {
      const { id_token } = response.params;
      signIn(id_token);
    }
  }, [response]);

  useEffect(() => {
    if (initialized) {
      const todayBlocks = blocks.filter((b) => isToday(b.createdAt, 4));
      todayBlockIdsRef.current = todayBlocks.map((b) => b.id);
      const serverText = todayBlocks.map((b) => b.text).join("\n");

      // Only update if server has different content than what we last saved
      // This preserves local empty lines while still accepting server changes
      const localLines = text.split("\n").filter((l) => l.trim()).join("\n");
      if (serverText !== lastSavedTextRef.current && serverText !== localLines) {
        setText(serverText);
        lastSavedTextRef.current = serverText;
      }
    }
  }, [initialized, blocks]);

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSave = async (newText: string) => {
    if (newText === lastSavedTextRef.current) return;

    // Only save non-empty lines, but preserve the full text for editing
    const lines = newText.split("\n").filter((l) => l.trim());
    const now = new Date().toISOString();
    const existingIds = [...todayBlockIdsRef.current];
    const newIds: string[] = [];

    // Update or create blocks for each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (existingIds[i]) {
        // Update existing block
        await saveBlock({
          id: existingIds[i],
          text: line,
          updatedAt: now,
        });
        newIds.push(existingIds[i]);
      } else {
        // Create new block
        const id = generateId();
        await saveBlock({
          id,
          text: line,
          createdAt: now,
          calendarEventId: null,
          position: i,
          version: 1,
          updatedAt: now,
          deletedAt: null,
        });
        newIds.push(id);
      }
    }

    // Delete extra blocks if we have fewer lines now
    for (let i = lines.length; i < existingIds.length; i++) {
      await deleteBlock(existingIds[i]);
    }

    todayBlockIdsRef.current = newIds;
    lastSavedTextRef.current = newText;
  };

  const handleTextChange = (newText: string) => {
    setText(newText);

    // Debounce save to avoid saving on every keystroke
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(newText);
    }, 500);
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

      <ScrollView
        ref={scrollViewRef}
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        onContentSizeChange={() => {
          if (!hasScrolledRef.current) {
            scrollViewRef.current?.scrollToEnd({ animated: false });
            hasScrolledRef.current = true;
          }
        }}
      >
        {dayGroups.map((group) => (
          <View key={group.day} style={styles.dayGroup}>
            <Text style={[styles.dayHeader, isDark && styles.dayHeaderDark]}>
              {group.day}
            </Text>
            {group.blocks.map((block) => (
              <MarkdownLine key={block.id} block={block} isDark={isDark} />
            ))}
          </View>
        ))}

        <View style={styles.todaySection}>
          <Text style={[styles.dayHeader, isDark && styles.dayHeaderDark]}>
            {getLogicalDay(new Date().toISOString(), 4)}
          </Text>
          <TextInput
            style={[styles.input, isDark && styles.inputDark]}
            value={text}
            onChangeText={handleTextChange}
            placeholder="start logging..."
            placeholderTextColor={isDark ? "#666" : "#999"}
            multiline
            autoFocus
            scrollEnabled={false}
          />
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
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
  },
  contentContainer: {
    paddingHorizontal: 20,
    flexGrow: 1,
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
  todaySection: {
    flex: 1,
    minHeight: 200,
  },
  input: {
    fontSize: 14,
    lineHeight: 21,
    color: "#0a0a0a",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
    flex: 1,
    textAlignVertical: "top",
  },
  inputDark: {
    color: "#f5f5f5",
  },
  bottomPadding: {
    height: 300,
  },
  text: {
    color: "#999",
  },
  textDark: {
    color: "#666",
  },
});
