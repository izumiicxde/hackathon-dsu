import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.get("/api/v1", (req, res) => {
  res.json({ message: "api is healthy", status: 200 });
});

app.post("/api/gemini-context", async (req, res) => {
  try {
    const { crop, condition } = req.body;
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const prompt = `Explain briefly the cause, prevention, and organic treatment for ${condition} in ${crop}.`;

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
