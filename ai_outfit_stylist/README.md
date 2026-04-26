# StyleAI — AI Outfit Stylist + Virtual Try-On Mirror
### MSc IT Project | Vibha Pandey

---

## 📁 Folder Structure

```
ai_outfit_stylist/
├── app.py                  ← Flask backend (main server)
├── requirements.txt        ← Python dependencies
├── templates/
│   └── index.html          ← Main UI page
├── static/
│   ├── css/
│   │   └── style.css       ← All styling
│   └── js/
│       └── main.js         ← Frontend logic + MediaPipe + Lens
├── uploads/                ← Temp uploads (auto-created)
├── model/                  ← (Put your trained CNN model here)
└── lens/                   ← (Put Lens Studio files here)
```

---

## 🚀 STEP-BY-STEP SETUP

### STEP 1 — Install Python
- Download Python 3.10 from https://python.org
- During install, check ✅ "Add Python to PATH"
- Open VS Code, open the `ai_outfit_stylist` folder

---

### STEP 2 — Create Virtual Environment
Open terminal in VS Code (`Ctrl + ~`) and run:

```bash
py -3.11 -m venv .venv
python -m venv venv
```

Activate it:
- **Windows:** `venv\Scripts\activate`
- **Mac/Linux:** `source venv/bin/activate`

You should see `(venv)` in your terminal.

---

### STEP 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

> ⚠️ If TensorFlow fails, try: `pip install tensorflow-cpu==2.15.0`
> ⚠️ If mediapipe fails: `pip install mediapipe --pre`

---

### STEP 4 — Run the App

```bash
python app.py
```

Open your browser at: **http://localhost:5000**

---

### STEP 5 — Set Up Lens Studio AR Try-On

This is the KEY step for accurate cloth AR.

#### 5a. Download Tools
1. Download **Lens Studio**: https://lensstudio.snapchat.com (free)
2. Download **Snap Camera**: https://ar.snap.com/snap-camera (for desktop preview)

#### 5b. Create Your AR Cloth Lens
1. Open Lens Studio
2. Go to **Templates** → Search **"Cloth Simulation"** or **"Body Try-On"**
3. Import your outfit images (PNG with transparent background recommended)
4. In the **Scene**, select the cloth mesh → replace with your outfit texture
5. Adjust body tracking points (shoulders, waist, hips)
6. Click **Preview** to test with your webcam in Lens Studio

#### 5c. Publish the Lens
1. Click **Share** → **Publish**
2. Log in with your Snapchat/Lens Studio account
3. After publishing, copy the **Lens ID** (looks like: `a1b2c3d4e5f6...`)

#### 5d. Connect to the App
Open `app.py`, find this function (~line 100):

```python
def lens_config():
    return jsonify({
        'lens_id': 'YOUR_SNAP_LENS_ID_HERE',   ← Paste Lens ID here
        'snap_api_token': 'YOUR_TOKEN_HERE',   ← Optional Camera Kit token
        ...
    })
```

Replace `YOUR_SNAP_LENS_ID_HERE` with your actual Lens ID.

---

### STEP 6 — Train Your CNN Model (Optional but Recommended)

#### Download Datasets
```bash
# DeepFashion2 (outfit compatibility)
# Register at: https://github.com/switchablenorms/DeepFashion2
# Follow their download instructions

# Dress Code (virtual try-on)
git clone https://github.com/aimagelab/dress-code
```

#### Train the Model
Place your training script in `model/train.py`. Basic structure:

```python
import tensorflow as tf
from tensorflow.keras import layers, models

# Build CNN
model = models.Sequential([
    layers.Conv2D(32, (3,3), activation='relu', input_shape=(224,224,3)),
    layers.MaxPooling2D(),
    layers.Conv2D(64, (3,3), activation='relu'),
    layers.MaxPooling2D(),
    layers.Conv2D(128, (3,3), activation='relu'),
    layers.GlobalAveragePooling2D(),
    layers.Dense(256, activation='relu'),
    layers.Dropout(0.5),
    layers.Dense(NUM_CLASSES, activation='softmax')
])

model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])
model.fit(train_data, epochs=20, validation_data=val_data)
model.save('model/outfit_recommender.h5')
```

Then in `app.py`, load and use the model:
```python
from tensorflow.keras.models import load_model
MODEL = load_model('model/outfit_recommender.h5')
```

---

### STEP 7 — Deploy (Optional)

For local network access (demo in college):
```bash
python app.py --host=0.0.0.0
```
Access from phone on same WiFi: `http://YOUR_PC_IP:5000`

---

## 🛠️ Technologies Used

| Technology | Purpose |
|---|---|
| Python + Flask | Backend server & API |
| TensorFlow + Keras | CNN outfit recommendation model |
| OpenCV | Image processing, color analysis |
| MediaPipe | Real-time body pose detection (browser) |
| Lens Studio (Snap) | Photorealistic AR cloth overlay |
| HTML/CSS/JavaScript | Frontend UI |
| DeepFashion2 | Training dataset for outfits |
| Dress Code | Virtual try-on training dataset |

---

## ❓ Troubleshooting

**Camera not working?**
→ Make sure you're running on `localhost` (not file://)
→ Allow camera permissions in browser

**MediaPipe not loading?**
→ Check internet connection (loads from CDN)
→ Try in Chrome browser

**Lens Studio AR not opening?**
→ Install Snap Camera first
→ Check lens_id is correctly set in app.py

**TensorFlow install fails?**
→ Use: `pip install tensorflow-cpu`
→ Or use Python 3.10 (not 3.12+)

---

## 📝 Notes for Viva

- The app uses a **rule-based recommendation engine** by default
- Replace it with the trained CNN model for full AI functionality
- Lens Studio provides **body mesh tracking** + **cloth simulation** — this is why it gives better AR results than raw OpenCV
- MediaPipe provides **33-point body skeleton** for basic overlay visualization

---

*Built for MSc IT (Part II) — AI Outfit Stylist + Virtual Try-On Mirror*
