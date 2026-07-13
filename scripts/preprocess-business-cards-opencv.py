from pathlib import Path
import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "datasets" / "business-cards" / "images"
OUTPUT_DIR = ROOT / "datasets" / "business-cards" / "opencv-scans"


def order_points(points):
    rect = np.zeros((4, 2), dtype="float32")
    s = points.sum(axis=1)
    rect[0] = points[np.argmin(s)]
    rect[2] = points[np.argmax(s)]
    diff = np.diff(points, axis=1)
    rect[1] = points[np.argmin(diff)]
    rect[3] = points[np.argmax(diff)]
    return rect


def four_point_transform(image, points):
    rect = order_points(points)
    (tl, tr, br, bl) = rect
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_width = max(int(width_a), int(width_b), 600)
    max_height = max(int(height_a), int(height_b), 300)
    dst = np.array(
        [[0, 0], [max_width - 1, 0], [max_width - 1, max_height - 1], [0, max_height - 1]],
        dtype="float32",
    )
    matrix = cv2.getPerspectiveTransform(rect, dst)
    return cv2.warpPerspective(image, matrix, (max_width, max_height))


def detect_card(image):
    ratio = image.shape[0] / 700.0
    resized = cv2.resize(image, (int(image.shape[1] / ratio), 700))
    gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
    gray = cv2.bilateralFilter(gray, 9, 75, 75)
    edged = cv2.Canny(gray, 35, 120)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edged = cv2.dilate(edged, kernel, iterations=1)
    contours, _ = cv2.findContours(edged, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:8]

    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.025 * perimeter, True)
        area = cv2.contourArea(approx)
        image_area = resized.shape[0] * resized.shape[1]
        if len(approx) == 4 and image_area * 0.08 < area < image_area * 0.95:
            return approx.reshape(4, 2) * ratio

    # Fallback: foreground-ish bounding rectangle from saturation/value difference.
    hsv = cv2.cvtColor(resized, cv2.COLOR_BGR2HSV)
    sat = hsv[:, :, 1]
    value = hsv[:, :, 2]
    mask = cv2.inRange(sat, 20, 255) | cv2.inRange(value, 0, 225)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=3)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    contour = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(contour)
    if w * h < resized.shape[0] * resized.shape[1] * 0.08:
        return None
    points = np.array([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], dtype="float32")
    return points * ratio


def enhance_for_ocr(image):
    if image.shape[1] < 1800:
        scale = 1800 / image.shape[1]
        image = cv2.resize(image, (1800, int(image.shape[0] * scale)), interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    denoised = cv2.fastNlMeansDenoising(gray, h=8)
    adaptive = cv2.adaptiveThreshold(
        denoised,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        31,
        9,
    )
    return adaptive


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for image_path in sorted(INPUT_DIR.glob("*.jpg")):
        image = cv2.imread(str(image_path))
        if image is None:
            continue
        points = detect_card(image)
        if points is not None:
            scanned = four_point_transform(image, points.astype("float32"))
        else:
            scanned = image
        enhanced = enhance_for_ocr(scanned)
        out_path = OUTPUT_DIR / f"{image_path.stem}.png"
        cv2.imwrite(str(out_path), enhanced)
        print(out_path)


if __name__ == "__main__":
    main()
