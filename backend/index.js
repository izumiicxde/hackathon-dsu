import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();

app.use(express.json());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  cors({
    origin: ["http://localhost:5173"],
  })
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/api/v1", (req, res) => {
  res.json({ message: "api is healthy", status: 200 });
});

app.post("/api/v1/agent-response", async (req, res) => {
  try {
    // Destructure from request body
    // const { label, advice, confidence } = req.body;
    const b = req.body;
    console.log(b);
    return res.json({ message: "done" });

    if (!label || !advice || !confidence) {
      return res
        .status(400)
        .json({ error: "Missing required fields: label, advice, confidence" });
    }
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Prompt including TF info and asking for simple explanation
    const prompt = `
You are "KrishiRakshak", an AI agricultural assistant for natural farming for farmers in Karnataka.
You have the following information:

- Detected Issue: ${label} 
- TensorFlow Model Advice: ${advice} (confidence: ${confidence})

Instructions:

1. Explain clearly what this issue means for the crop in simple terms, suitable for an uneducated farmer.
2. Provide natural remedies (bio-pesticides, cultural practices, predator releases) in simple actionable steps.
3. Give a short example or daily routine for treating this pest/disease.
4. Explain expected effectiveness in easy terms:
   - Yield: how much crop will be saved or improved
   - Pest control: how well pests will reduce
   - Soil health: how soil improves
5. Include any precaution or simple tips for recurrence prevention.
6. Keep the explanation short, easy to remember, and local language friendly (can include Kannada words if useful).

Structure the output as:

- Problem Understanding:
- Simple Action Steps:
- Daily Routine / Tips:
- Expected Outcome:
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    res.json({ explanation: text });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch Gemini response" });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`Server running on port ${process.env.PORT}`)
);
