import cv2
import numpy as np
from sklearn.svm import SVC
from skimage.feature import hog
import joblib
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import accuracy_score
import os

# Load dataset
human_images = ["dataset/human/" + f for f in os.listdir("dataset/human")]
animal_images = ["dataset/animal/" + f for f in os.listdir("dataset/animal")]

X, y = [], []

# Function to extract HOG features
def extract_hog_features(image):
    image = cv2.resize(image, (64, 128))  # Resize to standard input size
    features, _ = hog(image, pixels_per_cell=(8, 8), cells_per_block=(2, 2), visualize=True)
    return features

# Process images
for img_path in human_images:
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is not None:
        X.append(extract_hog_features(img))
        y.append("Human")

for img_path in animal_images:
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is not None:
        X.append(extract_hog_features(img))
        y.append("Animal")

# Convert to NumPy arrays
X = np.array(X)
y = np.array(y)

# Encode labels
label_encoder = LabelEncoder()
y = label_encoder.fit_transform(y)

# Split dataset
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

# Train SVM classifier
clf = SVC(kernel='linear', probability=True)
clf.fit(X_train, y_train)

# Evaluate model
y_pred = clf.predict(X_test)
accuracy = accuracy_score(y_test, y_pred)
print(f"Model Accuracy: {accuracy:.2f}")

# Save model
joblib.dump(clf, "motion_classifier.pkl")

# Initialize background subtractor
bg_subtractor = cv2.createBackgroundSubtractorMOG2(history=500, varThreshold=50, detectShadows=True)

# Process video feed (replace with ESP32-CAM image source)
cap = cv2.VideoCapture("video_feed.mp4")  # Change to 0 for webcam

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    fg_mask = bg_subtractor.apply(gray)  # Background subtraction
    fg_mask = cv2.medianBlur(fg_mask, 5)

    contours, _ = cv2.findContours(fg_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    for cnt in contours:
        if cv2.contourArea(cnt) > 500:  # Filter small objects
            x, y, w, h = cv2.boundingRect(cnt)
            roi = gray[y:y+h, x:x+w]
            
            features = extract_hog_features(roi).reshape(1, -1)
            probabilities = clf.predict_proba(features)[0]
            prediction = np.argmax(probabilities)
            confidence = probabilities[prediction] * 100
            label = label_encoder.inverse_transform([prediction])[0]
            
            cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
            cv2.putText(frame, f"{label} ({confidence:.1f}%)", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)

    cv2.imshow("Motion Detection", frame)
    if cv2.waitKey(30) & 0xFF == 27:
        break

cap.release()
cv2.destroyAllWindows()
