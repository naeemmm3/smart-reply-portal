async function sendMessage() {
  console.log("Button clicked");

  const inputField = document.getElementById("userInput");
  const message = inputField.value;

  try {
    const res = await fetch("http://127.0.0.1:5000/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messages: [{ text: message }]
      })
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Server error (${res.status}): ${errorText}`);
    }

    const data = await res.json();

    document.getElementById("response").innerText = data.reply;

    inputField.value = ""; // clear input

  } catch (error) {
    console.error("Error:", error);
    document.getElementById("response").innerText = "Failed to get reply.";
  }
}
