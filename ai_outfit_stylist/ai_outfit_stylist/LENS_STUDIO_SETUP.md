# 🎬 Lens Studio Integration Guide

This guide shows how to set up **Lens Studio** for the AR virtual try-on feature without needing Snap Camera.

---

## ✨ What Changed

Instead of requiring **Snap Camera** installation, your app now supports **THREE ways** to access Lens Studio lenses:

| Method | Device | Setup | Quality |
|--------|--------|-------|---------|
| **🌐 Web AR** | Desktop + Mobile | Click a link | Good |
| **📱 Snapchat App** | Mobile only | Install Snapchat | Best |
| **🎥 Pose Mirror** | Desktop + Mobile | No setup | Basic |

---

## 🚀 Quick Start (5 minutes)

### Step 1: Create a Lens Studio Account

1. Go to **[lensstudio.snapchat.com](https://lensstudio.snapchat.com)**
2. Click **Sign Up** and create your account (or sign in with Snapchat)
3. Agree to the terms and complete setup

### Step 2: Create Your First Clothing Try-On Lens

1. Click **"New Project"** on the dashboard
2. Search for **"ClothTryOn"** template
3. Select it and click **"Create"**
4. Save your project with a name (e.g., "StyleAI Wardrobe")

### Step 3: Add Your Outfits to the Lens

Inside Lens Studio:

1. **Open the template resources** in the left panel
2. Find the **"Shirt"** or **"Clothing"** assets
3. Right-click → **Replace with image**
4. Upload your outfit images one by one
5. Repeat for different clothing categories (shirts, dresses, pants, etc.)

**Pro Tip:** Optimize images for AR:
- Recommended size: **512x512 to 1024x1024 pixels**
- Format: PNG with transparent background (best for overlays)
- Or JPG for full images

### Step 4: Publish Your Lens

1. Click **"Publish"** in the top right
2. Choose **"World Lens"** or **"Unlisted"** (Unlisted recommended for testing)
3. Wait for approval (usually instant for unlisted)
4. Once approved, click the lens to view details
5. **Copy your Lens ID** (looks like: `a1B2cD3eF4g5h6i7j8k9`)

### Step 5: Add Lens ID to StyleAI App

1. Open your project's **[app.py](./ai_outfit_stylist/app.py)**
2. Find this line (around line 180):
   ```python
   lens_id = 'YOUR_LENS_ID_HERE'  # Replace with your published Lens Studio ID
   ```
3. Replace `YOUR_LENS_ID_HERE` with your actual Lens ID
4. Save the file

### Step 6: Restart the App

```bash
# In VS Code terminal:
python app.py
```

Open your browser to `http://localhost:5000` and click **"Launch AR Try-On Lens"** ✨

---

## 🎯 Using the AR Try-On Feature

### For Desktop Users

1. **Select an outfit** from the catalog
2. Click **"Launch AR Try-On Lens"**
3. Click **"Web AR Try-On"** option
4. Your default browser opens the Lens Studio web preview
5. Allow camera permissions when prompted
6. See yourself with the selected outfit in real-time!

### For Mobile Users

**Option A: Web AR (Simplest)**
- Select outfit → Click "Launch" → Choose "Web AR Try-On"
- Opens in mobile browser — works on any phone

**Option B: Snapchat App (Best Quality)**
- Install the Snapchat app on your phone
- Select outfit → Click "Launch" → Choose "Snapchat Mobile App"
- Opens in Snapchat with better effects and performance

**Option C: Pose Mirror (No Apps Needed)**
- Click **"Start OpenCV + MediaPipe Mirror"** 
- Allows your webcam/phone camera to track your body
- Uses computer vision to overlay outfits

---

## 🔧 Customizing Your Lens

### Change Clothing Images

In Lens Studio:

1. **Right-click** on any outfit asset
2. Select **"Replace with image"**
3. Choose a new image from your computer
4. Click **"Publish"** to update

### Add New Clothing Categories

1. **Duplicate** an existing clothing layer
2. **Right-click** → Replace with your image
3. Create a **script** or UI button to toggle visibility
4. Publish again

### Advanced: Custom Try-On Effects

- Add **pose detection** to animate clothes based on body movements
- Use **face filters** alongside clothing try-ons
- Create **multiple outfits** visible simultaneously
- Add **background/backdrop changes**

See [Lens Studio Docs](https://support.snapchat.com/a/lens-studio) for scripting tutorials.

---

## 📱 Testing on Your Phone

### Method 1: QR Code (Easiest)

Lens Studio generates a **QR code** for testing:

1. In Lens Studio, click **"Test on device"**
2. Scan the QR code with your phone camera
3. Snapchat opens automatically with your lens preview
4. Test the try-on experience

### Method 2: Via StyleAI Web App

1. Open the StyleAI app on your phone: `http://YOUR_IP:5000`
2. Click **"Launch AR Try-On Lens"**
3. Choose your preferred method

### Method 3: Direct Snapchat Search

Once your lens is **published** (not unlisted):

1. Open **Snapchat app**
2. Tap the **explore/search icon**
3. Search for your lens name
4. Tap to use it

---

## ❓ Troubleshooting

### "Invalid Lens ID" error

- ✅ Make sure you copied the **exact Lens ID** from Lens Studio
- ✅ Verify the lens has been **published** (not in drafts)
- ✅ Restart the Flask app: `python app.py`

### Web AR Won't Open

- ✅ Check that your Lens ID is correct in `app.py`
- ✅ Try on a **different browser** (Chrome works best)
- ✅ For mobile, use **Chrome or Safari**, not all browsers support WebGL

### "Camera access denied"

- ✅ Check browser **permissions** → allow camera access
- ✅ For HTTPS sites, camera is required for security
- ✅ Try **private/incognito mode**

### Webcam/Mobile Camera Not Working

- ✅ Grant **camera permissions** when prompted
- ✅ Ensure no other app is using the camera
- ✅ Try reloading the page

### Lens Not Loading in Snapchat

- ✅ Make sure your lens was **published** successfully
- ✅ Check that it's **"World Lens"** or **"Unlisted"** (not Draft)
- ✅ Wait a few minutes after publishing for Snap's servers to cache it
- ✅ Reinstall the Snapchat app if issues persist

---

## 📚 Resources

- **[Lens Studio Documentation](https://support.snapchat.com/a/lens-studio)**
- **[Lens Studio Templates](https://lensstudio.snapchat.com/templates)**
- **[ClothTryOn Template Guide](https://support.snapchat.com/a/clothesTryOn)**
- **[Getting Started with Lens Studio](https://support.snapchat.com/a/getting-started-lens-studio)**

---

## 🎨 Next Steps

### Enhance Your Lens
- Add more outfit variations
- Include accessories (hats, shoes, bags)
- Add **color variants** of each outfit
- Create **style suggestions** based on selected items

### Integrate with Your App
- Store selected outfits in a **favorites list**
- Track **outfit combinations** users tried
- Show **recommendation results** in the lens
- Add **sharing features** to save looks

### Deploy to Production
- Set up **HTTPS** (required for camera access)
- Host on **Heroku**, **Netlify**, or **AWS**
- File to Lens Studio submissions (to get featured)
- Share with beta testers!

---

**Happy styling! ✨👗**

Questions? Check the [Snapchat Lens Studio Community](https://community.snapchat.com/lens-creators) or visit our GitHub repository.
