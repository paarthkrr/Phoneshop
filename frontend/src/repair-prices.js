// Starting ("from") repair prices. Shown on /repairs and used by the chat assistant.
// backend/chat-knowledge.js repeats these numbers for the AI; a backend test checks they match.
export const REPAIRS_BY_DEVICE = {
  Phone: [
    { name: "Screen replacement", from: 85 },
    { name: "Battery replacement", from: 59 },
    { name: "Charging port", from: 55 },
    { name: "Camera repair", from: 75 },
    { name: "Water damage diagnosis", from: 50 },
  ],
  Tablet: [
    { name: "Screen replacement", from: 170 },
    { name: "Battery replacement", from: 90 },
    { name: "Charging port", from: 90 },
  ],
  Laptop: [
    { name: "Screen replacement", from: 180 },
    { name: "Keyboard replacement", from: 120 },
    { name: "Battery replacement", from: 110 },
    { name: "Charging port", from: 100 },
  ],
  Watch: [
    { name: "Screen replacement", from: 90 },
    { name: "Battery replacement", from: 70 },
  ],
};
