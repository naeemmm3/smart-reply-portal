require("dotenv").config();

console.log("Backend starting...");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const { GoogleGenAI } = require("@google/genai");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

// MongoDB connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected ✅"))
  .catch((err) => console.log("MongoDB Error:", err.message));

// MongoDB Schema
const messageSchema = new mongoose.Schema({
  sender: {
    type: String,
    enum: ["me", "other"],
    required: true,
  },
  text: {
    type: String,
    required: true,
  },
  mode: {
    type: String,
    default: "normal",
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const chatSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "New Chat",
    },
    mode: {
      type: String,
      default: "normal",
    },
    messages: [messageSchema],
  },
  { timestamps: true }
);

const Chat = mongoose.model("Chat", chatSchema);

// AI helper functions
function buildToneProfile(messages) {
  const myMsgs = messages.filter((m) => m.sender === "me").slice(-8);

  if (!myMsgs.length) {
    return { style: "neutral", politeness: "medium", length: "short" };
  }

  const text = myMsgs.map((m) => m.text).join(" ").toLowerCase();

  let style = "neutral";

  const casualScore =
    (text.match(/\b(hey|yeah|ok|okay|sure|bro|yup|cool|nice|no worries)\b|😊|👍|😂/g) || []).length;

  const formalScore =
    (text.match(/\b(please|kindly|certainly|thank you|regards|appreciate|understood|noted)\b/g) || []).length;

  if (casualScore > formalScore) style = "casual";
  if (formalScore > casualScore) style = "formal";

  const politeness = /(please|thank|thanks|appreciate|kindly)/i.test(text)
    ? "high"
    : "medium";

  const avg =
    myMsgs.reduce((sum, msg) => sum + msg.text.length, 0) / myMsgs.length;

  let length = "short";
  if (avg > 80) length = "long";
  else if (avg > 40) length = "medium";

  return { style, politeness, length };
}

function getLastIncoming(messages) {
  return [...messages].reverse().find((m) => m.sender === "other")?.text || "";
}

function getLastMessage(messages) {
  return messages[messages.length - 1] || null;
}

function detectIntent(text) {
  text = (text || "").toLowerCase();

  if (/urgent|asap|immediately|right now|quickly|before|deadline|today/.test(text)) {
    return "urgent_request";
  }

  if (/send|share|give|provide|upload|forward|submit|report|file|document|attachment/.test(text)) {
    return "request";
  }

  if (/error|issue|problem|not working|failed|bug|fix|crash|screenshot/.test(text)) {
    return "support";
  }

  if (/thanks|thank you|appreciate|helped/.test(text)) {
    return "gratitude";
  }

  if (/meeting|call|schedule|available|free|time|tomorrow|today|evening|morning/.test(text)) {
    return "scheduling";
  }

  if (/confirm|done|received|okay|fine|got it/.test(text)) {
    return "confirmation";
  }

  if (/what|why|how|when|can you|could you|will you/.test(text)) {
    return "question";
  }

  return "general";
}

function detectUrgency(text) {
  text = (text || "").toLowerCase();

  if (/urgent|asap|immediately|right now|before|deadline|today|quickly/.test(text)) {
    return "high";
  }

  if (/soon|tomorrow|later|quick|whenever possible/.test(text)) {
    return "medium";
  }

  return "low";
}

function clean(text) {
  if (!text) return "";

  return String(text)
    .replace(/^["']|["']$/g, "")
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^(short|friendly|professional)\s*:\s*/i, "")
    .trim()
    .slice(0, 140);
}

function ruleBasedFallback(intent) {
  if (intent === "urgent_request") {
    return {
      short: "Sure, I’ll prioritize it.",
      friendly: "Sure, I’ll handle it quickly and update you.",
      professional: "Understood. I will prioritize this and update you shortly.",
    };
  }

  if (intent === "request") {
    return {
      short: "Sure, I’ll send it.",
      friendly: "Sure, I’ll share it shortly.",
      professional: "Understood. I will share it shortly.",
    };
  }

  if (intent === "support") {
    return {
      short: "Please send the screenshot.",
      friendly: "Got it. Please share a screenshot so I can check it.",
      professional:
        "Understood. Please share the exact error message or screenshot so I can investigate.",
    };
  }

  if (intent === "gratitude") {
    return {
      short: "Glad I could help.",
      friendly: "You’re welcome, happy to help.",
      professional: "You’re welcome. I’m glad I could support you.",
    };
  }

  if (intent === "scheduling") {
    return {
      short: "Yes, that works for me.",
      friendly: "Sure, that works for me.",
      professional: "Yes, that time works for me. Please confirm the details.",
    };
  }

  return {
    short: "Okay, noted.",
    friendly: "Sure, I’ll take care of it.",
    professional: "Understood. I will take care of it.",
  };
}

async function generateReplies(conversation, tone, lastMsg, intent, urgency, replyNeeded) {
  if (replyNeeded === "No") {
    return {
      short: "No reply needed.",
      friendly: "No reply needed for now.",
      professional: "No response is required at this point.",
    };
  }

  const prompt = `
You are an AI assistant that generates smart replies for chat conversations.

Generate the next reply that "Me" should send.

Rules:
- Reply only to the latest incoming message.
- Do not explain anything.
- Keep replies short and natural.
- Each reply must be one sentence.
- Avoid robotic or repetitive replies.
- Adapt tone based on previous "Me" messages.
- Return valid JSON only.

Conversation:
${conversation}

Latest incoming message:
${lastMsg}

Intent: ${intent}
Urgency: ${urgency}

Tone:
Style: ${tone.style}
Politeness: ${tone.politeness}
Length: ${tone.length}

Return JSON:
{
  "short": "",
  "friendly": "",
  "professional": ""
}
`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: prompt,
    });

    const text = result.text || "";
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return ruleBasedFallback(intent);
    }

    const parsed = JSON.parse(match[0]);

    return {
      short: clean(parsed.short) || ruleBasedFallback(intent).short,
      friendly: clean(parsed.friendly) || ruleBasedFallback(intent).friendly,
      professional:
        clean(parsed.professional) || ruleBasedFallback(intent).professional,
    };
  } catch (error) {
    console.error("Gemini error:", error.message);
    return ruleBasedFallback(intent);
  }
}

// Routes
app.get("/", (req, res) => {
  res.send("Smart Reply Backend Running with MongoDB ✅");
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    backend: "running",
    database: mongoose.connection.readyState === 1 ? "connected" : "not connected",
    ai: "gemini",
    time: new Date().toISOString(),
  });
});

// Get all chats
app.get("/sessions", async (req, res) => {
  try {
    const chats = await Chat.find().sort({ updatedAt: -1 });

    const sessions = {};

    chats.forEach((chat) => {
      sessions[chat._id] = {
        title: chat.title,
        mode: chat.mode,
        messages: chat.messages,
      };
    });

    res.json(sessions);
  } catch (error) {
    res.status(500).json({ error: "Failed to load chats" });
  }
});

// Create new chat
app.post("/new-chat", async (req, res) => {
  try {
    const chat = await Chat.create({
      title: "New Chat",
      mode: "normal",
      messages: [],
    });

    res.json({ sessionId: chat._id });
  } catch (error) {
    res.status(500).json({ error: "Failed to create chat" });
  }
});

// Add message
app.post("/add-message", async (req, res) => {
  try {
    const { sessionId, sender, text, mode } = req.body;

    if (!sessionId || !sender || !text) {
      return res.status(400).json({
        error: "sessionId, sender and text are required",
      });
    }

    if (!["me", "other"].includes(sender)) {
      return res.status(400).json({
        error: "sender must be either 'me' or 'other'",
      });
    }

    let chat = await Chat.findById(sessionId);

    if (!chat) {
      chat = await Chat.create({
        title: text.slice(0, 35),
        mode: mode || "normal",
        messages: [],
      });
    }

    if (chat.title === "New Chat" && chat.messages.length === 0) {
      chat.title = text.slice(0, 35);
    }

    chat.mode = mode || chat.mode || "normal";

    chat.messages.push({
      sender,
      text,
      mode: mode || "normal",
      timestamp: new Date(),
    });

    await chat.save();

    res.json({
      chat: {
        title: chat.title,
        mode: chat.mode,
        messages: chat.messages,
      },
    });
  } catch (error) {
    console.error("Add message error:", error.message);
    res.status(500).json({ error: "Failed to add message" });
  }
});

// Suggest reply
app.post("/suggest-reply", async (req, res) => {
  try {
    const { sessionId, mode } = req.body;

    if (mode === "secure") {
      return res.json({
        short: "Secure Mode: AI disabled.",
        friendly: "Messages are private in Secure Mode.",
        professional:
          "AI suggestions are unavailable while Secure Mode is enabled.",
        toneProfile: buildToneProfile([]),
        conversationInsight: {
          lastMessage: "",
          intent: "secure_mode",
          urgency: "low",
          replyNeeded: "No",
        },
      });
    }

    if (!sessionId) {
      return res.status(400).json({
        error: "Valid sessionId is required",
      });
    }

    const chat = await Chat.findById(sessionId);

    if (!chat) {
      return res.status(404).json({
        error: "Chat not found",
      });
    }

    const messages = chat.messages || [];

    if (!messages.length) {
      return res.json({
        short: "No messages yet.",
        friendly: "No messages yet.",
        professional: "No messages yet.",
        toneProfile: buildToneProfile([]),
        conversationInsight: {
          lastMessage: "",
          intent: "none",
          urgency: "low",
          replyNeeded: "No",
        },
      });
    }

    const lastMessage = getLastMessage(messages);
    const lastMsg = getLastIncoming(messages);
    const intent = detectIntent(lastMsg);
    const urgency = detectUrgency(lastMsg);
    const tone = buildToneProfile(messages);
    const replyNeeded = lastMessage.sender === "other" ? "Yes" : "No";

    const recent = messages.slice(-7);

    const conversation = recent
      .map((m) => `${m.sender === "other" ? "Other Person" : "Me"}: ${m.text}`)
      .join("\n");

    const replies = await generateReplies(
      conversation,
      tone,
      lastMsg,
      intent,
      urgency,
      replyNeeded
    );

    res.json({
      ...replies,
      toneProfile: tone,
      conversationInsight: {
        lastMessage: lastMsg,
        intent,
        urgency,
        replyNeeded,
      },
    });
  } catch (error) {
    console.error("Suggest reply error:", error.message);
    res.status(500).json({
      error: "Failed to generate AI suggestions",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
