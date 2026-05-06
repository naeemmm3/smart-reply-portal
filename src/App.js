import React, { useState, useRef, useEffect } from "react";
import "./App.css";

function App() {
  const [messages, setMessages] = useState([
    { sender: "other", text: "Hey Naeem! Are you coming today?" },
  ]);
  const [input, setInput] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const chatEndRef = useRef(null);

  const sendMessage = () => {
    if (!input.trim()) return;

    setMessages([...messages, { sender: "me", text: input }]);
    setInput("");
  };

  const handleAI = async () => {
  try {
    const res = await fetch("http://127.0.0.1:5000/suggest", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messages }),
    });

    const data = await res.json();
    setSuggestion(data.suggestion);
  } catch (error) {
    console.error(error);
    setSuggestion("⚠️ Error connecting to server");
  }
};

  // auto scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="container">
      {/* Header */}
      <div className="header">💬 AI Chat</div>

      {/* Chat Area */}
      <div className="chat-area">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message ${
              msg.sender === "me" ? "me" : "other"
            }`}
          >
            {msg.text}
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* AI Suggestion */}
      {suggestion && (
        <div className="suggestion-box">
          🤖 {suggestion}
          <button
            onClick={() => {
              setInput(suggestion);
              setSuggestion("");
            }}
          >
            Use
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="input-area">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
        />

        <button className="send-btn" onClick={sendMessage}>
          Send
        </button>

        <button className="ai-btn" onClick={handleAI}>
          🤖
        </button>
      </div>
    </div>
  );
}

export default App;
