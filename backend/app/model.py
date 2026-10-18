from pathlib import Path
import time

import torch
import torch.nn as nn
from PIL import Image
from torchvision import transforms
from torchvision.models import resnet50


# --------------------------------------------------
# 1. Project paths and configuration
# --------------------------------------------------

# model.py is inside VisionAI/backend/app/
# parents[0] = app, parents[1] = backend, parents[2] = VisionAI
BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_PATH = BASE_DIR / "models" / "resnet50_full_finetune_best.pth"

CLASSES = [
    "airplane",
    "automobile",
    "bird",
    "cat",
    "deer",
    "dog",
    "frog",
    "horse",
    "ship",
    "truck",
]

# Use the NVIDIA GPU if CUDA is available.
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# --------------------------------------------------
# 2. Image preprocessing
# --------------------------------------------------

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=(0.485, 0.456, 0.406),
        std=(0.229, 0.224, 0.225),
    ),
])


# --------------------------------------------------
# 3. Load the trained model
# --------------------------------------------------

def load_model():
    if not MODEL_PATH.is_file():
        raise FileNotFoundError(
            f"Model checkpoint not found: {MODEL_PATH}\n"
            "Make sure the checkpoint is inside VisionAI/models/."
        )

    # Re-create the same ResNet-50 architecture.
    model = resnet50(weights=None)

    # CIFAR-10 has 10 output classes.
    model.fc = nn.Linear(model.fc.in_features, len(CLASSES))

    # Load the trained weights safely onto the selected device.
    state_dict = torch.load(
        MODEL_PATH,
        map_location=DEVICE,
        weights_only=True,
    )

    model.load_state_dict(state_dict)
    model = model.to(DEVICE)
    model.eval()

    return model


# Load once when this module is imported.
model = load_model()


# --------------------------------------------------
# 4. Predict an image
# --------------------------------------------------

def predict_image(image: Image.Image) -> dict:
    """
    Classify one image into one of the 10 CIFAR-10 classes.

    Returns the predicted class, top-5 probabilities,
    inference time, and device used.
    """

    # Convert grayscale, palette, or RGBA images to RGB.
    image = image.convert("RGB")

    # Preprocess the image and add the batch dimension.
    input_tensor = transform(image).unsqueeze(0).to(DEVICE)

    # Synchronize GPU work so inference timing is meaningful.
    if DEVICE.type == "cuda":
        torch.cuda.synchronize()

    start_time = time.perf_counter()

    with torch.inference_mode():
        logits = model(input_tensor)
        probabilities = torch.softmax(logits, dim=1)[0]

    if DEVICE.type == "cuda":
        torch.cuda.synchronize()

    inference_ms = (time.perf_counter() - start_time) * 1000

    # Select the five highest-probability classes.
    top_probabilities, top_indices = torch.topk(
        probabilities,
        k=min(5, len(CLASSES)),
    )

    top5 = [
        {
            "class_name": CLASSES[int(index)],
            "confidence": float(probability),
            "confidence_percent": round(float(probability) * 100, 2),
        }
        for probability, index in zip(
            top_probabilities.cpu(),
            top_indices.cpu(),
        )
    ]

    return {
        "predicted_class": top5[0]["class_name"],
        "confidence": top5[0]["confidence"],
        "confidence_percent": top5[0]["confidence_percent"],
        "top5": top5,
        "inference_ms": round(inference_ms, 2),
        "device": str(DEVICE),
    }
