const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

let submissions = [];

app.get("/api/test", (req, res) => {
  res.json({ message: "Backend working" });
});

app.post("/api/submit", (req, res) => {
  const submission = req.body;
  console.log("Received submission:", req.body);

  if (
    !submission ||
    typeof submission.code !== "string" ||
    submission.language !== "python" ||
    !Array.isArray(submission.results) ||
    typeof submission.timestamp !== "number"
  ) {
    return res.status(400).json({ message: "Invalid submission payload" });
  }

  submissions.push(submission);
  return res.json({ message: "Submission stored" });
});

app.get("/api/submissions", (req, res) => {
  res.json(submissions);
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

