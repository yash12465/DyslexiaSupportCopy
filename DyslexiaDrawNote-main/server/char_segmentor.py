import os
import cv2 
import numpy as np
import math

def rotate_image(image, angle):
    """
        Rotates the given image by the input angle in the counter-clockwise direction
        Parameters
        ----------
            image : ndim np.array
                image to be rotated
            angle : float
                angle of rotation as degrees.
        Returns
        -------
            rotated image as np.array
    """
    print("rotate_image is called in char_segmentor")
    # create an tuple that contains height/2, width/2
    image_center = tuple(np.array(image.shape[1::-1]) / 2) 
    # rot_mat 2x3 rotation mattrix
    rot_mat = cv2.getRotationMatrix2D(image_center, angle, 1.0)
    # apply the affine transformation to the image
    # size of the output image image.shape[1::-1]
    result = cv2.warpAffine(image, rot_mat, image.shape[1::-1], flags=cv2.INTER_LINEAR)
    return result

def read_image(img_path):
    print("read_image is called in char_segmentor")
    image = cv2.imread(img_path)

    scale_percent = 18  # percent of original size
    width = int(image.shape[1] * scale_percent / 100)
    height = int(image.shape[0] * scale_percent / 100)
    dim = (width, height)
    rescaled_img = cv2.resize(image, dim, interpolation=cv2.INTER_AREA) 
    return image, rescaled_img  

def save_img(dir_path,filename,img):
    """
        dir_path - directory path where the image will be saved
        filename - requires a valid image format
        img - image to be saved
    """
    print("save_img is called in char_segmentor")
    file_path = os.path.join(dir_path,filename)
    cv2.imwrite(file_path,img)

def find_text_angle(dilated_img,org_img):
    """
        org_img - original image
        img - dilated img
    """
    print("find_text_angle is called in char_segmentor")
    lines = cv2.HoughLinesP(dilated_img,rho=1,theta=np.pi/180,threshold=30,minLineLength=5,maxLineGap=20)

    nb_lines = len(lines)
    angle = 0

    for line in lines:
        x1,y1,x2,y2 = line[0]
        angle += math.atan2((y2-y1),(x2-x1)) 

    angle/=nb_lines

    rotated = rotate_image(org_img, angle-1)
    rot_dilated = rotate_image(dilated_img,angle-1)

    return rotated, rot_dilated
 
def extract_text_lines(img,output_dir):   
    """
        img - image from which the text lines are extracted
        output_dir - directory where the extracted lines should be saved 
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.medianBlur(gray, 5)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 5, 5)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (16, 2))
    dilate = cv2.dilate(thresh, kernel, iterations=2)
    rotated,rot_dilated = find_text_angle(dilate,img)

    cnts = cv2.findContours(rot_dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if len(cnts) == 2:
        cnts = cnts[0]
    else:
        cnts = cnts[1]

    lines_path = os.path.join(output_dir,'lines')  

    if not os.path.exists(lines_path):
        os.makedirs(lines_path)

    for line_idx, line in enumerate(cnts, start=-len(cnts)):
        x, y, w, h = cv2.boundingRect(line)
        roi = rotated[y:y + h, x:x + w]
        filename = 'line'+str(line_idx)+ '.jpg'
        save_img(lines_path,filename=filename,img=roi)
    
def extract_text_chars(img, output_dir):
    """
    Extract individual characters from an image and save them.
    """
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    cv2.imwrite(os.path.join(output_dir, 'debug_gray.jpg'), gray)

    # Apply median blur
    blur = cv2.medianBlur(gray, 7)
    cv2.imwrite(os.path.join(output_dir, 'debug_blur.jpg'), blur)

    # Adaptive thresholding
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                   cv2.THRESH_BINARY_INV, 7, 11)
    cv2.imwrite(os.path.join(output_dir, 'debug_thresh.jpg'), thresh)

    # Dilation to connect components
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 7))
    dilate = cv2.dilate(thresh, kernel, iterations=1)
    cv2.imwrite(os.path.join(output_dir, 'debug_dilate.jpg'), dilate)

    # Contour detection
    cnts = cv2.findContours(dilate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = cnts[0] if len(cnts) == 2 else cnts[1]

    print(f"[DEBUG] Found {len(cnts)} contours")

    chars_path = os.path.join(output_dir, 'chars')
    if not os.path.exists(chars_path):
        os.makedirs(chars_path)

    debug_img = img.copy()
    for char_idx, character in enumerate(cnts, start=-len(cnts)):
        x, y, w, h = cv2.boundingRect(character)
        print(f"[DEBUG] Char {char_idx}: x={x}, y={y}, w={w}, h={h}")
        roi = img[y:y + h, x:x + w]
        filename = 'char' + str(char_idx) + '.jpg'
        save_img(chars_path, filename=filename, img=roi)

        # Draw bounding boxes for debugging
        cv2.rectangle(debug_img, (x, y), (x + w, y + h), (0, 255, 0), 2)

    cv2.imwrite(os.path.join(output_dir, 'debug_bounding_boxes.jpg'), debug_img)


def segment_char_images(img):
    """
        Segments individual characters from a word image and returns them as a list of image arrays.
        This function is used in pipeline inference, so it returns character images rather than saving them.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    blur = cv2.medianBlur(gray, 7)
    thresh = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, 7, 11)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 7))
    dilate = cv2.dilate(thresh, kernel, iterations=1)

    cnts = cv2.findContours(dilate, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    cnts = cnts[0] if len(cnts) == 2 else cnts[1]

    # Sort contours left to right
    cnts = sorted(cnts, key=lambda c: cv2.boundingRect(c)[0])

    char_imgs = []
    for c in cnts:
        x, y, w, h = cv2.boundingRect(c)
        roi = gray[y:y + h, x:x + w]
        char_imgs.append(roi)

    return char_imgs



if __name__ == '__main__':
    input_dir = os.path.join(os.getcwd(), 'output', 'words')  # where word images are stored
    output_dir = os.path.join(os.getcwd(), 'output', 'chars')

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    for word_img in os.listdir(input_dir):
        img_path = os.path.join(input_dir, word_img)
        print(f"[INFO] Reading image: {img_path}")
        img = cv2.imread(img_path)

        if img is None:
            print(f"[ERROR] Could not read image: {img_path}")
            continue

        word_name = os.path.splitext(word_img)[0]
        word_output_dir = os.path.join(output_dir, word_name)

        if not os.path.exists(word_output_dir):
            os.makedirs(word_output_dir)

        # Save debug versions of preprocessing steps to visually inspect
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        blur = cv2.medianBlur(gray, 7)
        thresh = cv2.adaptiveThreshold(
            blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY_INV, 7, 11
        )
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 7))
        dilate = cv2.dilate(thresh, kernel, iterations=1)

        cv2.imwrite(os.path.join(word_output_dir, 'debug_gray.jpg'), gray)
        cv2.imwrite(os.path.join(word_output_dir, 'debug_thresh.jpg'), thresh)
        cv2.imwrite(os.path.join(word_output_dir, 'debug_dilate.jpg'), dilate)

        print(f"[INFO] Saved debug images for: {word_img}")

        extract_text_chars(img, word_output_dir)
        print(f"[DONE] Extracted characters to: {word_output_dir}")

