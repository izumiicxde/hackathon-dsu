// App.jsx
import React, { useEffect, useRef, useState } from "react";
import * as tf from "@tensorflow/tfjs";
import { motion, AnimatePresence } from "framer-motion";
import { FiLoader, FiPlus, FiSend, FiX, FiMic } from "react-icons/fi";
import "./App.css";
import ReactMarkdown from "react-markdown";
import axios from "axios";
import toast, { Toaster } from "react-hot-toast";

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
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPayload, setModalPayload] = useState(null);
  const [isRequestSent, setIsRequestSent] = useState(false);
  const [agentData, setAgentData] = useState(null);

  const fileInputRef = useRef(null);
  const textRef = useRef(null);
  const scrollRef = useRef(null);
  let controller;

  // Load TF model
  useEffect(() => {
    (async () => {
      try {
        const m = await tf.loadLayersModel(MODEL_PATH);
        setModel(m);
        setLoadingModel(false);
        pushBotMessage("Model loaded — you can upload up to 4 images.");
      } catch (err) {
        console.error(err);
        setLoadingModel(false);
        pushBotMessage("Failed to load model. Check console.");
      }
    })();

    return () => selectedPreviews.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  // Abortable AI request
  const sendToAiSdk = async (payload) => {
    try {
      if (isRequestSent) controller?.abort();
      controller = new AbortController();
      setIsRequestSent(true);
      setAgentData(null);
      toast("Request sent");
      const res = await axios.post(
        "http://localhost:8000/api/v1/agent-response",
        { ...payload, messages },
        { signal: controller.signal }
      );
      setAgentData(res.data);
    } catch (err) {
      if (axios.isCancel(err)) toast("Request canceled");
      else if (err.name === "CanceledError") toast.error("Request aborted");
      else toast.error(err.message || "Failed. Try again.");
    } finally {
      setIsRequestSent(false);
    }
  };

  // Scroll to bottom
  useEffect(() => {
    if (!scrollRef.current) return;
    const t = setTimeout(() => {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
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

  // File selection & preview
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const allowed = Math.max(0, 4 - selectedFiles.length);
    const toAdd = files.slice(0, allowed);
    if (files.length > allowed) alert(`Max 4 images. Added first ${allowed}.`);
    const newFiles = [...selectedFiles, ...toAdd];

    // revoke old previews
    selectedPreviews.forEach((u) => URL.revokeObjectURL(u));
    const newPreviews = newFiles.map((f) => URL.createObjectURL(f));
    setSelectedFiles(newFiles);
    setSelectedPreviews(newPreviews);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelected = (idx) => {
    const nextFiles = selectedFiles.filter((_, i) => i !== idx);
    URL.revokeObjectURL(selectedPreviews[idx]);
    const nextPreviews = selectedPreviews.filter((_, i) => i !== idx);
    setSelectedFiles(nextFiles);
    setSelectedPreviews(nextPreviews);
  };

  // Predict
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

  const getMoreInfo = (payload) => {
    setAgentData(null);
    setModalPayload(payload);
    setModalOpen(true);
  };

  const handleSendPredict = async (userText = null) => {
    if (loadingModel || predicting) return;
    if (selectedFiles.length === 0 && !userText)
      return alert("Attach images or type a message.");

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
        console.error(err);
        removeBotTyping();
        pushBotMessage("Failed to load one image.");
        URL.revokeObjectURL(processingUrl);
        setPredicting(false);
        return;
      }

      let pred;
      try {
        pred = await predictImageElement(imgEl);
      } catch (err) {
        console.error(err);
        removeBotTyping();
        pushBotMessage("Prediction error (see console).");
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
        { id: Date.now() + Math.random(), type: "botCard", payload },
      ]);
    }

    removeBotTyping();
    setPredicting(false);
  };

  // Chat bubble component
  const ChatBubble = ({ msg }) => {
    if (msg.type === "user")
      return (
        <motion.div
          layout
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="self-end bg-[#0b7a5b] text-white p-3 rounded-2xl max-w-[80%] shadow"
        >
          <div className="text-sm whitespace-pre-wrap">{msg.text}</div>
          {msg.imgs?.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto">
              {msg.imgs.map((u, i) => (
                <img
                  key={i}
                  src={u}
                  alt={`sent-${i}`}
                  className="w-16 h-16 rounded-md object-cover border flex-shrink-0"
                />
              ))}
            </div>
          )}
        </motion.div>
      );

    if (msg.type === "bot")
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

    if (msg.type === "botTyping")
      return (
        <motion.div
          layout
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="self-start bg-[#121214] text-gray-200 p-3 rounded-2xl max-w-[40%] shadow flex items-center gap-2"
        >
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse animation-delay-150" />
          <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse animation-delay-300" />
          <div className="ml-2 text-xs text-gray-400">Analyzing...</div>
        </motion.div>
      );

    if (msg.type === "botCard") {
      const p = msg.payload;
      return (
        <motion.div
          layout
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -8 }}
          className="self-start bg-[#0f1112] p-3 rounded-xl shadow-md border border-gray-800 max-w-[92%]"
        >
          <div
            onClick={() => {
              setModalPayload(p);
              setModalOpen(true);
            }}
            className="flex flex-col gap-3 cursor-pointer justify-center items-center"
          >
            <img
              src={p.preview}
              alt={p.filename}
              className="w-full md:w-64 h-fit rounded-md object-cover border flex-shrink-0"
            />
            <div className="flex-1 flex flex-col justify-between w-full">
              <div className="flex items-start justify-between w-full">
                <div>
                  <div className="text-sm font-semibold">{p.readable}</div>
                  <div className="text-xs text-gray-400">
                    Confidence: {p.confidence}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-sm text-gray-200">{p.advice}</div>
              <div className="mt-3 w-full">
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
    <div className="min-h-screen flex flex-col md:flex-row bg-[#0b0b0c] text-white pb-32 md:pb-0">
      {/* Sidebar */}
      <aside className="w-full md:w-16 bg-[#0a0a0b] border-b md:border-r border-gray-900 flex flex-row md:flex-col items-center justify-around md:justify-start py-2 md:py-4 gap-4">
        <div className="w-10 h-10 bg-white/10 rounded flex items-center justify-center text-lg">
          🌾
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="px-4 md:px-6 py-4 border-b border-gray-900 flex items-center justify-between">
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
          className="flex-1 px-4 md:px-6 py-4 overflow-auto flex flex-col gap-4 pb-32"
        >
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} />
            ))}
          </AnimatePresence>
        </main>

        {/* Bottom input bar */}
        <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-3xl px-4 z-20">
          <div className="flex items-center gap-2 bg-[#111214] border border-gray-800 rounded-xl shadow-lg px-3 py-2 flex-nowrap">
            {/* Image select */}
            <label className="flex-shrink-0 w-28 h-10 flex items-center justify-center rounded-full bg-[#10a37f] text-white cursor-pointer">
              <div className="flex items-center gap-2">
                <FiPlus /> Add Image
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                disabled={loadingModel || predicting}
              />
            </label>

            {/* Image previews */}
            <div className="flex gap-2 overflow-x-auto max-w-[40%]">
              {selectedPreviews.map((u, i) => (
                <div
                  key={i}
                  className="relative group w-20 h-12 rounded-md overflow-hidden border flex-shrink-0"
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

            {/* Text input */}
            <input
              ref={textRef}
              type="text"
              placeholder="Ask or describe..."
              className="flex-1 bg-transparent text-gray-200 placeholder-gray-400 outline-none px-2 py-2 min-w-0"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSendPredict(e.target.value?.trim() || null);
                  e.target.value = "";
                }
              }}
            />

            {/* Mic */}
            <button className="flex-shrink-0 p-2 rounded-full hover:bg-gray-800">
              <FiMic className="text-gray-300" />
            </button>

            {/* Send */}
            <button
              onClick={() => {
                handleSendPredict(textRef.current?.value?.trim() || null);
                if (textRef.current) textRef.current.value = "";
              }}
              disabled={
                loadingModel ||
                predicting ||
                (selectedFiles.length === 0 && !textRef.current?.value)
              }
              className="flex-shrink-0 p-3 rounded-full bg-[#10a37f] hover:bg-[#0d8b6f] disabled:opacity-40 flex items-center justify-center"
            >
              <FiSend className="text-white" />
            </button>
          </div>
        </div>

        {/* Modal */}
        <AnimatePresence>
          {modalOpen && modalPayload && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md p-4"
            >
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
                className="relative max-h-[90vh] min-h-[80vh] w-full max-w-4xl bg-[#0f1112] rounded-2xl p-4 shadow-lg border border-gray-800 overflow-auto"
              >
                <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                  <div className="flex flex-col items-start gap-3">
                    <img
                      src={modalPayload.preview}
                      alt={modalPayload.filename}
                      className="w-52 h-fit rounded-md object-cover border"
                    />
                    <div>
                      <h3 className="text-lg font-semibold">
                        {modalPayload.readable}
                      </h3>
                      <div className="text-xs text-gray-400">
                        Confidence: {modalPayload.confidence}
                      </div>
                    </div>
                  </div>
                  <div className="overflow-y-auto prose prose-invert text-gray-200 w-full max-h-[50vh]">
                    <ReactMarkdown>{modalPayload.advice}</ReactMarkdown>
                    {agentData && agentData?.explanation ? (
                      <ReactMarkdown>{agentData.explanation}</ReactMarkdown>
                    ) : (
                      <div className="flex justify-center items-center w-full gap-3">
                        <FiLoader className="size-6 animate-spin" />
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setModalOpen(false)}
                  className="absolute top-2 right-2 p-1 rounded-full bg-red-600"
                >
                  <FiX className="text-white" />
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Toaster position="bottom-right" />
    </div>
  );
}
