import base64
import numpy as np
import cv2
from inference import get_model
import supervision as sv
import json

def process_sensor_data(sensor_data):
    # Check if we have video data available
    if not sensor_data.get("videoData", {}).get("available", False):
        print("No video data available")
        return None

    # Extract the base64 encoded image from videoData.data
    base64_image = sensor_data.get("videoData", {}).get("data", "")
    if not base64_image or base64_image == "No video captured":
        print("No valid video data found")
        return None

    # Step 1: Decode base64 to bytes
    try:
        image_bytes = base64.b64decode(base64_image)
    except Exception as e:
        print(f"Error decoding base64: {e}")
        return None

    # Step 2: Convert bytes to NumPy array
    nparr = np.frombuffer(image_bytes, np.uint8)

    # Step 3: Decode NumPy array to OpenCV image
    image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if image is None:
        print("Failed to decode image")
        return None

    # Step 4: Load YOLOv8 model
    model = get_model(model_id="people-detection-general/7", api_key="6Mg1YLfFTmWKD20TQsYz")

    # Step 5: Run inference
    results = model.infer(image)[0]
    detections = sv.Detections.from_inference(results)

    # Step 6: Annotate image with bounding boxes and confidence scores
    bounding_box_annotator = sv.BoxAnnotator()

    # Custom label format to include confidence scores
    labels = [
        f"person {confidence:.2f}"
        for confidence in detections.confidence
    ]

    annotated_image = bounding_box_annotator.annotate(scene=image, detections=detections)

    # Use custom labels with confidence scores
    label_annotator = sv.LabelAnnotator()
    annotated_image = label_annotator.annotate(
        scene=annotated_image,
        detections=detections,
        labels=labels
    )

    # Return the annotated image and detection info
    return {
        "annotated_image": annotated_image,
        "detection_count": len(detections.class_id),
        "detections": [
            {"confidence": float(conf), "box": box.tolist()}
            for conf, box in zip(detections.confidence, detections.xyxy)
        ]
    }

def process_mongodb_document(document):
    # Extract the sensorData object from the MongoDB document
    sensor_data = document.get("sensorData", {})

    # Process the sensor data
    result = process_sensor_data(sensor_data)

    if result:
        # Save the annotated image
        cv2.imwrite("output.jpeg", result["annotated_image"])

        # Update document with detection results if needed
        # For example, you might want to add a field for detection count
        document["sensorData"]["detectionResults"] = {
            "peopleDetected": result["detection_count"],
            "detections": result["detections"]
        }

        # You could also update the alertType based on detections
        if result["detection_count"] > 0:
            document["sensorData"]["alertType"] = "Poaching alert"

    return document
