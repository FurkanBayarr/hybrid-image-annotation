from flask import Flask, jsonify, request
from flask_cors import CORS
from ultralytics import YOLO
from PIL import Image
import random
import os
import sqlite3
import shutil
import collections
import yaml

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Define constant paths
GO_AGENT_DIR = "/home/furkanb/Documents/Annotation/Hard Hat Detection.yolov8/train/images"
DATABASE_PATH = "/home/furkanb/Documents/Annotation/hybrid-image-annotation/cloud-backend/annotations.db"
DATASET_DIR = "/home/furkanb/Documents/Annotation/hybrid-image-annotation/ai-service/dataset"

# Load pre-trained YOLOv8n model or custom trained model if available
try:
    print("Loading YOLOv8 model...")
    if os.path.exists("custom_best.pt"):
        print("Loading previously trained custom weights: custom_best.pt")
        model = YOLO("custom_best.pt")
    else:
        print("Loading baseline model: yolov8n.pt")
        model = YOLO("yolov8n.pt")
    print("YOLOv8 Model loaded successfully!")
except Exception as e:
    print(f"Error loading YOLOv8 model: {e}. Falling back to lazy loading.")
    model = None

@app.route('/', methods=['GET'])
def index():
    return "AURA AI Service is running! 🚀"

@app.route('/next', methods=['GET'])
def get_next_task():
    """
    Simulates an 'Active Learning' selection dynamically by scanning the dataset folder,
    excluding images that have already been annotated in the SQLite database.
    """
    try:
        if not os.path.exists(GO_AGENT_DIR):
            return jsonify({"error": f"Dataset directory not found: {GO_AGENT_DIR}"}), 404

        files = [f for f in os.listdir(GO_AGENT_DIR) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if not files:
            return jsonify({"error": "No images found in dataset directory"}), 404

        # Read already annotated image IDs from SQLite to filter them out
        annotated_files = set()
        if os.path.exists(DATABASE_PATH):
            try:
                conn = sqlite3.connect(DATABASE_PATH)
                cursor = conn.cursor()
                # GORM uses deleted_at for soft deletes
                cursor.execute("SELECT DISTINCT image_id FROM annotations WHERE deleted_at IS NULL")
                rows = cursor.fetchall()
                annotated_files = {row[0] for row in rows if row[0]}
                conn.close()
            except Exception as db_err:
                print(f"Error reading annotations database: {str(db_err)}")

        # Filter out already annotated images
        unannotated_files = [f for f in files if f not in annotated_files]

        if not unannotated_files:
            print("Active Learning: All images have been annotated!")
            return jsonify({
                "filename": None,
                "score": 0.0,
                "reason": "All images are annotated",
                "all_candidates": []
            })

        # Process first 24 unannotated candidate images
        subset = unannotated_files[:24]
        candidates = []
        for img in subset:
            score = round(random.uniform(0.0, 1.0), 2)
            candidates.append({'filename': img, 'score': score})

        # Sort by score descending (highest uncertainty first)
        candidates.sort(key=lambda x: x['score'], reverse=True)
        selected = candidates[0]

        response = {
            "filename": selected['filename'],
            "score": selected['score'],
            "reason": "High Uncertainty",
            "all_candidates": candidates
        }

        print(f"AI Selected for recommendation (excluding annotated): {response['filename']} with score {response['score']}")
        return jsonify(response)
    except Exception as e:
        print(f"Active Learning selection failed: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route('/auto-annotate', methods=['GET', 'POST'])
def auto_annotate():
    """
    Performs real-time YOLOv8 object detection on the specified image file
    and returns bounding box coordinates mapped to our frontend's classes.
    """
    global model
    if model is None:
        try:
            model = YOLO("yolov8n.pt")
        except Exception as e:
            return jsonify({"error": f"YOLOv8 model could not be loaded: {str(e)}"}), 500

    # Retrieve filename from GET query parameters or POST JSON body
    filename = None
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        filename = data.get('file')
    else:
        filename = request.args.get('file')

    if not filename:
        return jsonify({"error": "Missing 'file' parameter in request"}), 400

    # Resolve absolute path to the image in the go-agent directory
    image_path = os.path.join(GO_AGENT_DIR, filename)
    if not os.path.exists(image_path):
        return jsonify({"error": f"Image file not found at path: {image_path}"}), 404

    try:
        # Default confidence threshold set to 25% (0.25) to filter out low-confidence predictions
        default_thresh = 0.25
        conf_thresh = float(request.args.get('conf', default_thresh))

        # Run YOLOv8 inference with the custom confidence threshold and tighter NMS IoU threshold (0.45) to prevent duplicate overlapping boxes
        print(f"Running YOLOv8 inference on: {image_path} with conf={conf_thresh} and iou=0.45")
        results = model(image_path, verbose=False, conf=conf_thresh, iou=0.45)
        
        annotations = []
        
        # Iterate over results and extract detections
        for result in results:
            for box in result.boxes:
                cls_idx = int(box.cls[0])
                conf = float(box.conf[0])
                class_name = model.names.get(cls_idx, "Unknown")
                print(f"[DEBUG DETECT] Class: {class_name} (idx: {cls_idx}), Conf: {conf:.4f}")
                
                # COCO dataset class name
                class_name = model.names[cls_idx]
                
                # Map COCO classes to AURA UI categories
                aura_label = None
                if class_name in ["car", "truck", "bus"]:
                    aura_label = "Car"
                elif class_name in ["person"]:
                    aura_label = "Pedestrian"
                elif class_name in ["bicycle", "motorcycle"]:
                    aura_label = "Cyclist"
                elif class_name in ["traffic light", "stop sign"]:
                    aura_label = "Traffic Sign"
                
                # Dynamic Class Fallback:
                # If YOLO model has been fine-tuned and has custom names (like 'Elma'),
                # map them directly if they match!
                if aura_label is None and class_name in model.names.values():
                    # Preserve exact casing of the fine-tuned custom label name
                    aura_label = class_name
                
                # Skip any classes that don't match our active UI catalog to prevent canvas clutter
                if aura_label is None:
                    continue
                
                # Convert YOLO xyxy coordinates to x, y, width, height for Konva
                xyxy = box.xyxy[0].tolist()
                x = round(xyxy[0], 1)
                y = round(xyxy[1], 1)
                width = round(xyxy[2] - x, 1)
                height = round(xyxy[3] - y, 1)
                
                annotations.append({
                    "x": x,
                    "y": y,
                    "width": width,
                    "height": height,
                    "label": aura_label,
                    "confidence": round(conf, 2)
                })
                
        print(f"Successfully detected {len(annotations)} objects in {filename}")
        return jsonify(annotations)

    except Exception as e:
        print(f"Inference failed: {str(e)}")
        return jsonify({"error": f"AI Inference failed: {str(e)}"}), 500

@app.route('/train', methods=['POST'])
def train_model():
    """
    Continuous Learning Loop.
    Reads manual annotation database, builds a temporary YOLO dataset,
    runs a short fine-tuning session, and reloads the active model.
    """
    global model
    
    if not os.path.exists(DATABASE_PATH):
        return jsonify({"error": f"Cloud SQLite database not found at {DATABASE_PATH}"}), 404

    conn = None
    try:
        # Connect to cloud database
        conn = sqlite3.connect(DATABASE_PATH)
        cursor = conn.cursor()
        
        # Read all active non-deleted annotations
        cursor.execute("SELECT image_id, label, x, y, width, height FROM annotations WHERE deleted_at IS NULL")
        rows = cursor.fetchall()
        
        if not rows:
            return jsonify({"error": "Modeli eğitmek için veritabanında aktif etiket bulunmamaktadır. Lütfen önce birkaç nesneyi elinizle etiketleyip kaydedin! 🕵️‍♂️"}), 400

        print(f"Fetched {len(rows)} active annotations for transfer learning...")

        # Find distinct labels to build the class mapping index
        cursor.execute("SELECT DISTINCT label FROM annotations WHERE deleted_at IS NULL")
        unique_labels = [row[0] for row in cursor.fetchall() if row[0]]
        
        # Ensure our core UI categories are always in index, and append custom labels
        core_labels = ["Car", "Pedestrian", "Cyclist", "Traffic Sign"]
        for lbl in core_labels:
            if lbl not in unique_labels:
                unique_labels.append(lbl)
                
        class_to_idx = {name: idx for idx, name in enumerate(unique_labels)}
        print(f"Dynamic Training Class Map: {class_to_idx}")

        # Re-initialize local YOLO dataset folders
        images_dir = os.path.join(DATASET_DIR, "images", "train")
        labels_dir = os.path.join(DATASET_DIR, "labels", "train")
        
        # Clean previous dataset directories
        if os.path.exists(DATASET_DIR):
            shutil.rmtree(DATASET_DIR)
            
        os.makedirs(images_dir, exist_ok=True)
        os.makedirs(labels_dir, exist_ok=True)

        # Write dataset.yaml configuration file
        dataset_yaml = {
            "path": DATASET_DIR,
            "train": "images/train",
            "val": "images/train",
            "names": {idx: name for idx, name in enumerate(unique_labels)}
        }
        with open(os.path.join(DATASET_DIR, "dataset.yaml"), "w") as f:
            yaml.dump(dataset_yaml, f)

        # Group annotations by image_id
        image_annotations = collections.defaultdict(list)
        for row in rows:
            img_id, label, x, y, w, h = row
            image_annotations[img_id].append((label, x, y, w, h))

        # Copy images and write normalized YOLO label text files
        for img_id, anns in image_annotations.items():
            src_image_path = os.path.join(GO_AGENT_DIR, img_id)
            if not os.path.exists(src_image_path):
                print(f"Warning: Reference image not found on disk, skipping: {src_image_path}")
                continue
                
            dest_image_path = os.path.join(images_dir, img_id)
            shutil.copy(src_image_path, dest_image_path)
            
            # Read image dimensions to calculate normalized [0, 1] boundaries
            with Image.open(src_image_path) as img:
                img_w, img_h = img.size
                
            txt_filename = os.path.splitext(img_id)[0] + ".txt"
            txt_path = os.path.join(labels_dir, txt_filename)
            
            with open(txt_path, "w") as label_file:
                for ann in anns:
                    label, x, y, w, h = ann
                    class_idx = class_to_idx.get(label, 0)
                    
                    # Convert absolute pixel box to YOLO normal center format
                    x_center = (x + w / 2.0) / img_w
                    y_center = (y + h / 2.0) / img_h
                    w_norm = w / img_w
                    h_norm = h / img_h
                    
                    label_file.write(f"{class_idx} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")

        print("YOLO active learning dataset structured successfully!")
        
        # Load custom weights if available to warm-start training, otherwise baseline
        if os.path.exists("custom_best.pt"):
            print("Warm-starting training from previous custom weights: custom_best.pt")
            trainer_model = YOLO("custom_best.pt")
        else:
            print("Starting training from baseline model: yolov8n.pt")
            trainer_model = YOLO("yolov8n.pt")
        
        # Train model for 50 epochs with a small batch to keep CPU/GPU process brief (~30 seconds) and ensure learning convergence
        trainer_model.train(
            data=os.path.join(DATASET_DIR, "dataset.yaml"),
            epochs=50,
            imgsz=640,
            batch=2,
            workers=1,
            device="cpu",  # Train on CPU for universal hardware compatibility
            verbose=False
        )
        
        # Retrieve the exact path of the newly trained best weights
        best_pt_path = os.path.join(trainer_model.trainer.save_dir, "weights", "best.pt")
        print(f"Transfer learning complete! Copying weights to custom_best.pt...")
        
        # Copy output weights to custom_best.pt for persistence
        shutil.copy(best_pt_path, "custom_best.pt")
        
        # Live reload model in Flask server
        model = YOLO("custom_best.pt")
        print("Active model successfully switched in-memory to custom_best.pt!")
        
        return jsonify({
            "success": True,
            "message": f"Yapay zeka etiketlediğiniz {len(rows)} nesne ve {len(unique_labels)} sınıf üzerinden başarıyla eğitildi ve canlı kullanıma alındı! 🔄✨",
            "classes": unique_labels
        })

    except Exception as e:
        print(f"Transfer learning loop failed: {str(e)}")
        return jsonify({"error": f"Eğitim döngüsü başarısız oldu: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

if __name__ == '__main__':
    print("AURA AI Service (YOLOv8 Live Object Detector) running on port 5001...")
    app.run(port=5001, debug=True, use_reloader=False)  # Disable reloader to prevent multiple model instances
