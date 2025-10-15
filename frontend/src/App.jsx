// App.jsx
import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { motion, AnimatePresence } from "framer-motion";
import { FiLoader, FiPlus, FiSend, FiX, FiMic } from "react-icons/fi";
import "./App.css"; // Tailwind + your CSS
import ReactMarkdown from "react-markdown";
import axios from "axios";

// Labels must match your model
const LABELS = [
  "Cashew_Healthy",
  "Cashew_Diseased",
  "Cassava_Healthy",
  "Cassava_Diseased",
  "Maize_Healthy",
  "Maize_Diseased",
  "Tomato_Healthy",
  "Tomato_Diseased",
  "Unknown",
];

const MODEL_PATH = "/model/model.json";
const INPUT_SIZE = 224;
const CONF_THRESHOLD = 0.6;

export default function App() {
  const [model, setModel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedPreviews, setSelectedPreviews] = useState([]);
  const [loadingModel, setLoadingModel] = useState(true);
  const [predicting, setPredicting] = useState(false);

  // modal state for "Get More Info"
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPayload, setModalPayload] = useState(null);

  const [isRequestSent, setIsRequestSent] = useState(false);
  const [agentData, setAgentData] = useState();

  const fileInputRef = useRef(null);
  const textRef = useRef(null);
  const scrollRef = useRef(null);

  // Model load
  useEffect(() => {
    (async () => {
      try {
        const m = await tf.loadLayersModel(MODEL_PATH);
        setModel(m);
        setLoadingModel(false);
        pushBotMessage("Model loaded — you can upload up to 4 images.");
      } catch (err) {
        console.error("Model load error:", err);
        setLoadingModel(false);
        pushBotMessage("Failed to load model. See console.");
      }
    })();

    // cleanup preview URLs on unmount
    return () => selectedPreviews.forEach((u) => URL.revokeObjectURL(u));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  let controller; // store AbortController globally or per component

  const sendToAiSdk = async (payload) => {
    try {
      if (isRequestSent) {
        console.log("cancelled");
        controller?.abort();
      }

      // Create a new AbortController for this request
      controller = new AbortController();

      setIsRequestSent(true);

      const res = await axios.post(
        "http://localhost:8000/api/v1/agent-response",
        { ...payload, messages },
        { signal: controller.signal } // attach the signal to Axios
      );

      console.log(res.data);
      setAgentData(res.data);
    } catch (error) {
      if (axios.isCancel(error)) {
        console.log("Request canceled:", error.message);
      } else if (error.name === "CanceledError") {
        console.log("Request aborted:", error.message);
      } else {
        console.error(error);
      }
    } finally {
      setIsRequestSent(false);
    }
  };

  // close modal on Esc
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setModalOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // smooth autoscroll when messages change
  useEffect(() => {
    if (!scrollRef.current) return;
    const t = setTimeout(() => {
      try {
        scrollRef.current.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      } catch {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, 80);
    return () => clearTimeout(t);
  }, [messages]);

  const pushUserMessage = (text, imgs = []) =>
    setMessages((m) => [
      ...m,
      { id: Date.now() + Math.random(), type: "user", text, imgs },
    ]);
  const pushBotMessage = (text) =>
    setMessages((m) => [
      ...m,
      { id: Date.now() + Math.random(), type: "bot", text },
    ]);
  const pushBotTyping = () =>
    setMessages((m) => [
      ...m,
      { id: "typing-" + Date.now(), type: "botTyping" },
    ]);
  const removeBotTyping = () =>
    setMessages((m) => m.filter((x) => x.type !== "botTyping"));

  // file selection (creates fresh previews)
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allowed = Math.max(0, 4 - selectedFiles.length);
    const toAdd = files.slice(0, allowed);
    if (files.length > allowed) alert(`Max 4 images. Added first ${allowed}.`);
    const newFiles = [...selectedFiles, ...toAdd];

    // revoke previous previews and create new previews for current files
    selectedPreviews.forEach((u) => URL.revokeObjectURL(u));
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));

    setSelectedFiles(newFiles);
    setSelectedPreviews(newPreviews);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelected = (idx) => {
    const nextFiles = selectedFiles.filter((_, i) => i !== idx);
    const toRevoke = selectedPreviews[idx];
    URL.revokeObjectURL(toRevoke);
    const nextPreviews = selectedPreviews.filter((_, i) => i !== idx);
    setSelectedFiles(nextFiles);
    setSelectedPreviews(nextPreviews);
  };

  // predict using fresh object URL per file
  const predictImageElement = async (imgEl) => {
    if (!model) throw new Error("Model not ready");
    const t = tf.browser
      .fromPixels(imgEl)
      .resizeNearestNeighbor([INPUT_SIZE, INPUT_SIZE])
      .toFloat()
      .div(255.0)
      .expandDims(0);
    const preds = await model.predict(t).data();
    t.dispose();
    const maxIdx = preds.indexOf(Math.max(...preds));
    const conf = preds[maxIdx];
    let label = LABELS[maxIdx] ?? "Unknown";
    if (conf < CONF_THRESHOLD) label = "Unknown";
    return { label, confidence: (conf * 100).toFixed(1) + "%", raw: preds };
  };

  const adviceMap = {
    Cashew_Diseased: "Spray neem oil and remove infected leaves.",
    Cassava_Diseased: "Use compost and avoid overwatering.",
    Maize_Diseased: "Rotate crops and use Trichoderma-based compost.",
    Tomato_Diseased: "Use cow dung slurry and neem extract weekly.",
    Unknown:
      "Valid leaf detected or uncertain — retake photo from multiple angles.",
  };

  // Get More Info action -> open modal instead of pushing bot message
  const getMoreInfo = (payload) => {
    setModalPayload(payload);
    setModalOpen(true);
  };

  // handle send/predict
  const handleSendPredict = async (userText = null) => {
    if (loadingModel || predicting) return;
    if (selectedFiles.length === 0 && !userText) {
      alert("Attach images (up to 4) or type a message.");
      return;
    }

    const userMsgText = userText
      ? `${userText} (${selectedFiles.length} image(s))`
      : `Sent ${selectedFiles.length} image(s) for analysis.`;

    pushUserMessage(userMsgText, selectedPreviews);

    const filesToProcess = [...selectedFiles];

    setSelectedFiles([]);
    setSelectedPreviews([]);

    pushBotTyping();
    setPredicting(true);

    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      const processingUrl = URL.createObjectURL(file);
      const imgEl = new Image();
      imgEl.src = processingUrl;

      try {
        await new Promise((res, rej) => {
          imgEl.onload = () => res(true);
          imgEl.onerror = (e) => rej(e);
        });
      } catch (err) {
        console.error("Image load error", err);
        removeBotTyping();
        pushBotMessage("Failed to load one image for analysis.");
        URL.revokeObjectURL(processingUrl);
        setPredicting(false);
        return;
      }

      let pred;
      try {
        pred = await predictImageElement(imgEl);
      } catch (err) {
        console.error("Predict error", err);
        removeBotTyping();
        pushBotMessage("Prediction error for one image (see console).");
        URL.revokeObjectURL(processingUrl);
        setPredicting(false);
        return;
      }

      const readable = pred.label.replace("_", " ");
      const advice = adviceMap[pred.label] || adviceMap["Unknown"];
      const payload = {
        filename: file.name,
        preview: processingUrl,
        label: pred.label,
        readable,
        confidence: pred.confidence,
        advice,
        raw: pred.raw,
      };

      setMessages((m) => [
        ...m,
        {
          id: Date.now() + Math.random(),
          type: "botCard",
          payload,
        },
      ]);
    }

    removeBotTyping();
    setPredicting(false);
  };

  // Chat bubble renderer
  const ChatBubble = ({ msg }) => {
    if (msg.type === "user") {
      return (
        <motion.div
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="self-end bg-[#0b7a5b] text-white p-3 rounded-2xl max-w-[80%] shadow"
        >
          <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
          {msg.imgs && msg.imgs.length > 0 && (
            <div className="flex gap-2 mt-3">
              {msg.imgs.map((u, i) => (
                <img
                  key={i}
                  src={u}
                  alt={`sent-${i}`}
                  className="w-16 h-16 rounded-md object-cover border"
                />
              ))}
            </div>
          )}
        </motion.div>
      );
    }

    if (msg.type === "bot") {
      return (
        <motion.div
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="self-start bg-[#121214] text-gray-200 p-3 rounded-2xl max-w-[80%] shadow"
        >
          <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
        </motion.div>
      );
    }

    if (msg.type === "botTyping") {
      return (
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="self-start bg-[#121214] text-gray-200 p-3 rounded-2xl max-w-[40%] shadow"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse animation-delay-150" />
            <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse animation-delay-300" />
            <div className="ml-2 text-xs text-gray-400">Analyzing...</div>
          </div>
        </motion.div>
      );
    }

    if (msg.type === "botCard") {
      const p = msg.payload;

      // card click opens modal on small screens (and still leaves button available)
      return (
        <motion.div
          layout
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          className="self-start bg-[#0f1112] p-3 rounded-xl shadow-md border border-gray-800 max-w-[92%] "
        >
          <div
            // clicking the card (outside the button) opens modal for ease on touch devices
            onClick={() => {
              setModalPayload(p);
              setModalOpen(true);
            }}
            className="flex flex-col  gap-3 cursor-pointer  justify-center items-center"
          >
            <img
              src={p.preview}
              alt={p.filename}
              className="w-64 h-fit rounded-md object-cover border flex-shrink-0"
            />
            <div className="flex-1 flex flex-col justify-between">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-sm font-semibold">{p.readable}</div>
                  <div className="text-xs text-gray-400">
                    Confidence: {p.confidence}
                  </div>
                </div>
              </div>

              <div className="mt-2 text-sm text-gray-200">{p.advice}</div>

              {/* BIG button instead of "Send to AI SDK"
                  - stopPropagation so clicking the button doesn't trigger the outer card onClick twice */}
              <div className="mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    sendToAiSdk(p);
                    getMoreInfo(p);
                  }}
                  aria-label={`Get more info about ${p.readable}`}
                  className="block w-full touch-manipulation bg-[#10a37f] text-white py-3 rounded-xl font-semibold hover:bg-[#0d8b6f] text-center"
                >
                  Get More Info
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen flex bg-[#0b0b0c] text-white pb-32">
      {/* Left sidebar */}
      <aside className="w-16 bg-[#0a0a0b] border-r border-gray-900 flex flex-col items-center py-4 gap-4">
        <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-lg">
          🌾
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="px-6 py-4 border-b border-gray-900 flex items-center justify-between">
          <div>
            <div className="text-lg font-semibold">KrishiRakshak</div>
            <div className="text-xs text-gray-400">AI Crop Disease Chat</div>
          </div>
          <div className="text-xs text-gray-400">
            {loadingModel
              ? "Loading model..."
              : predicting
              ? "Analyzing..."
              : "Ready"}
          </div>
        </header>

        {/* Chat messages */}
        <main
          ref={scrollRef}
          className="flex-1 px-6 py-4 overflow-auto flex flex-col gap-4"
        >
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} />
            ))}
          </AnimatePresence>
        </main>

        {/* Fixed input pill centered */}
        <div className="fixed left-1/2 transform -translate-x-1/2 bottom-6 w-full max-w-3xl px-4">
          <div className="relative">
            <div className="bg-[#111214] border border-gray-800 rounded-xl shadow-lg px-3 py-3">
              {/* thumbnails row inside pill (top) */}
              <div className="flex gap-2 mb-3 items-center overflow-x-auto">
                {selectedPreviews.map((u, i) => (
                  <div
                    key={i}
                    className="relative group w-20 h-12 rounded-md overflow-hidden border"
                  >
                    <img
                      src={u}
                      alt={`sel-${i}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      onClick={() => removeSelected(i)}
                      className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 hidden group-hover:flex items-center justify-center"
                    >
                      <FiX size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* bottom row: plus (left), text input, mic, send */}
              <div className="flex items-center gap-3">
                <label className="w-30 h-10 flex-shrink-0 rounded-full flex items-center justify-center bg-[#10a37f] text-white cursor-pointer">
                  <div className="flex items-center gap-2">
                    <FiPlus />
                    <p>Add Image</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    className="hidden"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFileSelect}
                    disabled={loadingModel || predicting}
                  />
                </label>

                <input
                  id="messageInput"
                  ref={textRef}
                  type="text"
                  placeholder="Ask or describe (optional)..."
                  className="flex-1 bg-transparent text-gray-200 placeholder-gray-400 outline-none px-2 py-2"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = e.target.value?.trim();
                      handleSendPredict(val || null);
                      e.target.value = "";
                    }
                  }}
                />

                <button
                  className="p-2 rounded-full hover:bg-gray-800"
                  title="Voice (placeholder)"
                >
                  <FiMic className="text-gray-300" />
                </button>

                <button
                  onClick={() => {
                    const val = textRef.current?.value?.trim();
                    handleSendPredict(val || null);
                    if (textRef.current) textRef.current.value = "";
                  }}
                  disabled={
                    loadingModel ||
                    predicting ||
                    (selectedFiles.length === 0 && !textRef.current?.value)
                  }
                  className="p-3 rounded-full bg-[#10a37f] hover:bg-[#0d8b6f] disabled:opacity-40 flex items-center justify-center"
                  title="Send / Predict"
                >
                  <FiSend className="text-white" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Modal for Get More Info */}
        <AnimatePresence>
          {modalOpen && modalPayload && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
            >
              {/* overlay */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.6 }}
                exit={{ opacity: 0 }}
                onClick={() => setModalOpen(false)}
                className="absolute inset-0 bg-black"
              />

              <motion.div
                initial={{ y: 20, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 20, opacity: 0, scale: 0.98 }}
                className="relative bg-[#0f1112] max-w-lg w-full mx-4 rounded-2xl p-4 shadow-lg border border-gray-800 z-10"
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-title"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <img
                      src={modalPayload.preview}
                      alt={modalPayload.filename}
                      className="w-20 h-20 rounded-md object-cover border"
                    />
                    <div>
                      <h3 id="modal-title" className="text-lg font-semibold">
                        {modalPayload.readable}
                      </h3>
                      <div className="text-xs text-gray-400">
                        Confidence: {modalPayload.confidence}
                      </div>
                    </div>
                  </div>
                  <div className="">
                    <ReactMarkdown>
                      {agentData !== null &&
                        agentData !== "" &&
                        JSON.stringify(agentData)}
                    </ReactMarkdown>
                  </div>

                  <button
                    onClick={() => setModalOpen(false)}
                    aria-label="Close"
                    className="p-2 rounded-full hover:bg-gray-800"
                  >
                    <FiX />
                  </button>
                </div>

                <div className="mt-4 text-sm text-gray-200">
                  {modalPayload.advice}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => {
                      // copy advice to clipboard
                      try {
                        navigator.clipboard.writeText(modalPayload.advice);
                      } catch {}
                    }}
                    className="flex-1 bg-[#10a37f] py-2 rounded-lg text-sm font-semibold hover:bg-[#0d8b6f]"
                  >
                    Copy Advice
                  </button>

                  <button
                    onClick={() => {
                      // fallback action: close modal and optionally push a bot message
                      setModalOpen(false);
                      pushBotMessage(
                        `💡 Advice saved: ${modalPayload.readable}`
                      );
                    }}
                    className="flex-1 bg-gray-800 py-2 rounded-lg text-sm font-semibold hover:bg-gray-700"
                  >
                    Save & Close
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
