# VisionAI — AI-Powered Image Classification

A full-stack computer vision application built with **PyTorch, ResNet-50, FastAPI, React, and TypeScript**. VisionAI uses a fine-tuned deep learning model to classify uploaded images and return prediction results through a web interface.

## 🚀 Live Demo

- **Frontend:** https://visionai-frontend-ybxa.onrender.com/
- **Backend API:** https://visionai-1pvd.onrender.com/
- **API Documentation:** https://visionai-1pvd.onrender.com/docs

## ✨ Features

- Image classification using a fine-tuned ResNet-50 model.
- Image uploads in JPG, PNG, and WEBP formats.
- Prediction results with confidence scores and top-five predictions when available.
- FastAPI REST API for model inference.
- SQLite-based prediction history.
- Image validation and a 10 MB upload limit.
- Cloud deployment using Render.

## 🛠️ Tech Stack

- **Frontend:** React, TypeScript, Vite
- **Backend:** Python, FastAPI, Uvicorn
- **Deep Learning:** PyTorch, Torchvision, ResNet-50
- **Image Processing:** Pillow
- **Database:** SQLite
- **Deployment:** Render

## 🧠 Model

VisionAI uses a fine-tuned ResNet-50 model trained for image classification on the CIFAR-10 dataset.

The model checkpoint is `resnet50_full_finetune_best.pth`.

## ⚙️ Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/Legends0024/VisionAi.git
cd VisionAi
```

### 2. Download the model

Download and extract the checkpoint from the [GitHub Release](https://github.com/Legends0024/VisionAi/releases/tag/v1.0.0) into the `models/` directory.

### 3. Start the backend

```bash
cd backend
python -m venv .venv
```

Activate the environment on Windows:

```powershell
.\.venv\Scripts\Activate.ps1
```

Install the required dependencies and start the API:

```bash
python -m pip install -r requirements-render.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
```

Create `frontend/.env.local`:

```env
VITE_API_URL=http://127.0.0.1:8000
```

Run the development server:

```bash
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173`.

## 🔌 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API status |
| GET | `/health` | Health check |
| POST | `/predict` | Classify an uploaded image |
| GET | `/history` | Retrieve prediction history |
| DELETE | `/history/{prediction_id}` | Delete a prediction |
| DELETE | `/history` | Clear prediction history |

## 📁 Project Structure

```text
VisionAi/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   └── model.py
│   ├── requirements-render.txt
│   ├── uploads/
│   └── visionai.db
├── frontend/
│   └── src/
├── models/
│   └── resnet50_full_finetune_best.pth
└── README.md
```

## ☁️ Deployment

The frontend and backend are deployed separately on Render. The frontend connects to the backend through the `VITE_API_URL` environment variable, while the backend serves predictions through FastAPI.

**Note:** Free hosting may introduce backend cold starts, and local SQLite data or uploaded files may not persist across restarts or redeployments.

## 👨‍💻 Author

**Manav Joshi**  
B.Tech — Artificial Intelligence and Data Science

[GitHub Profile](https://github.com/Legends0024) · [VisionAI Repository](https://github.com/Legends0024/VisionAi)