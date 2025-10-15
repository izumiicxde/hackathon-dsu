import { useState, useEffect } from "react";
import * as tf from "@tensorflow/tfjs";
import "./App.css";

const LABELS = [
  "Cashew_Healthy",
  "Cashew_Diseased",
  "Cassava_Healthy",
  "Cassava_Diseased",
  "Maize_Healthy",
  "Maize_Diseased",
  "Tomato_Healthy",
  "Tomato_Diseased",
];

const INPUT_SIZE = 224;
const MODEL_PATH = "/model/model.json";

export default function App() {
  const [model, setModel] = useState(null);
  const [result, setResult] = useState("Loading model...");
  const [preview, setPreview] = useState(null);
  const [disabled, setDisabled] = useState(true);

  useEffect(() => {
    async function loadModel() {
      try {
        const loaded = await tf.loadLayersModel(MODEL_PATH);
        setModel(loaded);
        setDisabled(false);
        setResult("Model loaded. Upload an image to predict.");
      } catch (err) {
        console.error("Model load error:", err);
        setResult("Error loading model. Check console for details.");
      }
    }
    loadModel();
  }, []);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setResult("Image loaded — analyzing...");
  };

  const predict = async (img) => {
    if (!model) {
      setResult("Model not ready yet.");
      return;
    }
    try {
      let t = tf.browser
        .fromPixels(img)
        .resizeNearestNeighbor([INPUT_SIZE, INPUT_SIZE])
        .toFloat()
        .div(255.0)
        .expandDims(0);

      const preds = await model.predict(t).data();
      let maxIdx = preds.indexOf(Math.max(...preds));
      const label = LABELS[maxIdx] || `class_${maxIdx}`;
      const confidence = (preds[maxIdx] * 100).toFixed(1) + "%";

      const adviceMap = {
        Cashew_Diseased: "Spray neem oil and remove infected leaves.",
        Cassava_Diseased: "Use compost and avoid overwatering.",
        Maize_Diseased: "Rotate crops and use Trichoderma-based compost.",
        Tomato_Diseased: "Use cow dung slurry and neem extract weekly.",
      };

      if (preds[maxIdx] < 0.6) {
        setResult(
          `Prediction uncertain (${confidence}). Try retaking the photo.`
        );
      } else {
        setResult(
          `Detected: ${label.replace(
            "_",
            " "
          )}\nConfidence: ${confidence}\nAdvice: ${
            adviceMap[label] || "Healthy or unknown. Retake photo if unsure."
          }`
        );
      }

      t.dispose();
    } catch (err) {
      console.error("Prediction error:", err);
      setResult("Prediction failed. Check console.");
    }
  };

  const handleImageLoad = (e) => predict(e.target);

  return (
    <div className="min-h-screen  flex flex-col items-center p-6 ">
      <h1 className="text-3xl font-bold text-green-700 mb-6">
        KrishiRakshak - AI Crop Disease Detector
      </h1>

      <div className="bg-white shadow-lg rounded-2xl p-6 w-full max-w-sm">
        <input
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          disabled={disabled}
          className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-300 rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {preview && (
          <img
            src={preview}
            alt="preview"
            onLoad={handleImageLoad}
            className="w-full rounded-xl mt-4 object-cover"
          />
        )}

        <div className="mt-4 text-gray-800 text-sm whitespace-pre-line font-medium">
          {result}
        </div>
      </div>
    </div>
  );
}
