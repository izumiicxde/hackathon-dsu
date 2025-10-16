import { useState } from "react";
import { FiMic } from "react-icons/fi";

export default function SpeakButton({ agentData }) {
  const [speaking, setSpeaking] = useState(false);
  let utterance;

  const speak = (text) => {
    if (!window.speechSynthesis)
      return alert("TTS not supported in this browser");

    if (speaking) {
      // Stop current speech
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    // Start speaking
    utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  };

  return (
    <button
      className="flex-shrink-0 px-5 hover:bg-gray-800 flex p-4 rounded-lg mt-5 justify-center items-center gap-3"
      onClick={() => {
        if (agentData && agentData.explanation) speak(agentData.explanation);
      }}
    >
      <FiMic className="text-gray-300 cursor-pointer" />
      {speaking ? "Stop" : "Speak"}
    </button>
  );
}
