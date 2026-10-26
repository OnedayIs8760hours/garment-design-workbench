import React from "react";
import {
  clearGenerationConversation, getGenerationQuota, saveGeneratedImage, sendGenerationMessage,
} from "../api.js";

const MaterialContext = React.createContext(null);

// The provider is keyed by authenticated user in App. Navigation preserves the session;
// signing out discards it, including in-flight responses belonging to that user.
export function MaterialSessionProvider({ children }) {
  const [messages, setMessages] = React.useState([]);
  const [conversationId, setConversationId] = React.useState(null);
  const [quota, setQuota] = React.useState(null);
  const [pending, setPending] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const [sessionError, setSessionError] = React.useState("");
  const busy = React.useRef(false);

  const refreshQuota = React.useCallback(async () => {
    const result = await getGenerationQuota();
    setQuota(result);
  }, []);

  const send = async (message) => {
    if (busy.current || !message.trim()) return;
    busy.current = true;
    setPending(true);
    setSessionError("");
    setMessages((items) => [...items, { id: crypto.randomUUID(), role: "user", text: message }]);
    let result;
    try {
      result = await sendGenerationMessage(message, conversationId);
    } catch (error) {
      if (error.payload?.conversation_id) result = error.payload;
      else {
        setSessionError(error.message);
        setMessages((items) => [...items, {
          id: crypto.randomUUID(), role: "assistant", text: error.message, failed: true,
        }]);
      }
    } finally {
      if (result) {
        setConversationId(result.conversation_id);
        setQuota(result.quota);
        setMessages((items) => [...items, {
          id: crypto.randomUUID(), role: "assistant", text: result.reply,
          images: result.images, status: result.status,
        }]);
        if (result.images?.some((image) => image.asset)) setRevision((value) => value + 1);
      }
      busy.current = false;
      setPending(false);
    }
  };

  const retrySave = async (messageId, imageIndex) => {
    const image = messages.find((item) => item.id === messageId)?.images?.[imageIndex];
    if (!image || image.asset) return;
    const saved = await saveGeneratedImage(image);
    setMessages((items) => items.map((item) => item.id !== messageId ? item : {
      ...item, text: "图片已保存到素材库。", status: "completed",
      images: item.images.map((value, index) => index === imageIndex ? saved : value),
    }));
    setRevision((value) => value + 1);
  };

  const clear = async () => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setSessionError("");
    try {
      if (conversationId) await clearGenerationConversation(conversationId);
      setMessages([]);
      setConversationId(null);
    } catch (error) {
      setSessionError(error.message);
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const markDeleted = (keys) => {
    const deleted = new Set(keys);
    setMessages((items) => items.map((item) => ({
      ...item,
      images: item.images?.map((image) => deleted.has(image.asset?.object_key)
        ? { ...image, deleted: true } : image),
    })));
  };

  return (
    <MaterialContext.Provider value={{
      messages, quota, pending, revision, sessionError, send, clear, retrySave, markDeleted, refreshQuota,
    }}>
      {children}
    </MaterialContext.Provider>
  );
}

export function useMaterialSession() {
  return React.useContext(MaterialContext);
}
