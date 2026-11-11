const fileInput = document.getElementById("fileInput");
const dropArea = document.getElementById("dropArea");
const fileInfo = document.getElementById("fileInfo");
const sourceFormat = document.getElementById("sourceFormat");
const targetFormat = document.getElementById("targetFormat");
const convertButton = document.getElementById("convertButton");
const statusBox = document.getElementById("status");
const downloadLink = document.getElementById("downloadLink");

// Leave empty when frontend and API use the same domain.
// Set this to the Render API URL when the backend is deployed separately.
const API_BASE = window.URL36_CONVERTER_API || "https://url36-converter-api.onrender.com";

const allowedFormats = [
  "pdf", "doc", "docx", "txt", "rtf", "odt",
  "html", "htm", "xls", "xlsx", "csv",
  "ppt", "pptx", "odp"
];

const MAX_FILE_SIZE = 15 * 1024 * 1024;

let selectedFile = null;
let downloadUrl = null;

function getExtension(filename) {
  return filename.split(".").pop().toLowerCase();
}

function setStatus(message) {
  statusBox.textContent = message;
}

function selectFile(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    selectedFile = null;
    convertButton.disabled = true;
    setStatus("Maximum file size is 15 MB.");
    return;
  }

  const extension = getExtension(file.name);

  if (!allowedFormats.includes(extension)) {
    selectedFile = null;
    convertButton.disabled = true;
    setStatus("Unsupported file format. Please choose a supported document.");
    return;
  }

  selectedFile = file;

  sourceFormat.innerHTML = "";
  const option = document.createElement("option");
  option.value = extension;
  option.textContent = extension.toUpperCase();
  sourceFormat.appendChild(option);
  sourceFormat.disabled = false;

  fileInfo.textContent =
    `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;

  convertButton.disabled = false;
  downloadLink.hidden = true;

  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }

  setStatus("File selected. Choose your output format.");
}

fileInput.addEventListener("change", () => {
  selectFile(fileInput.files[0]);
});

dropArea.addEventListener("dragover", event => {
  event.preventDefault();
  dropArea.classList.add("dragover");
});

dropArea.addEventListener("dragleave", () => {
  dropArea.classList.remove("dragover");
});

dropArea.addEventListener("drop", event => {
  event.preventDefault();
  dropArea.classList.remove("dragover");
  selectFile(event.dataTransfer.files[0]);
});

convertButton.addEventListener("click", async () => {
  if (!selectedFile) {
    setStatus("Please select a document first.");
    return;
  }

  const from = sourceFormat.value;
  const to = targetFormat.value;

  if (from === to) {
    setStatus("Your document is already in this format.");
    return;
  }

  convertButton.disabled = true;
  downloadLink.hidden = true;
  setStatus("Uploading and converting your document...");

  const formData = new FormData();
  formData.append("file", selectedFile);
  formData.append("target", to);

  try {
    const response = await fetch(`${API_BASE}/api/convert`, {
      method: "POST",
      body: formData
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      throw new Error(result.error || "Conversion failed. Please try again.");
    }

    const blob = await response.blob();

    if (!blob.size) {
      throw new Error("The conversion returned an empty file.");
    }

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);

    downloadUrl = URL.createObjectURL(blob);

    const originalName = selectedFile.name.replace(/\.[^.]+$/, "");
    const safeName = originalName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const outputName = `${safeName || "converted"}.${to}`;

    downloadLink.href = downloadUrl;
    downloadLink.download = outputName;
    downloadLink.textContent = `Download ${outputName}`;
    downloadLink.hidden = false;

    setStatus("Conversion complete. Your document is ready to download.");
  } catch (error) {
    setStatus(error.message || "Unable to connect to the conversion server.");
  } finally {
    convertButton.disabled = !selectedFile;
  }
});

window.addEventListener("beforeunload", () => {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});
