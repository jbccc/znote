import express from "express";
import cors from "cors";
import compression from "compression";
import authRoutes from "./routes/auth.js";
import syncRoutes from "./routes/sync.js";
import calendarRoutes from "./routes/calendar.js";

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(compression()); // Gzip responses
app.use(cors());
app.use(express.json({ limit: "1mb" })); // Limit payload size

// Health check
app.get("/health", (_, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/auth", authRoutes);
app.use("/sync", syncRoutes);
app.use("/calendar", calendarRoutes);

app.listen(PORT, () => {
  console.log(`znote-server running on port ${PORT}`);
});
