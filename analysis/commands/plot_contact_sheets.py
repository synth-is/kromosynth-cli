import os
import re
import argparse
from PIL import Image
from pdf2image import convert_from_path
from reportlab.lib.pagesizes import letter
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

def search_pdfs(root_dir):
    types = {}
    for root, _, files in os.walk(root_dir):
        for file in files:
            if file.endswith('.pdf'):
                full_path = os.path.join(root, file)
                match = re.search(r'.*/plot/([^/]+)/.*pdf$', full_path)
                if match:
                    plot_type = match.group(1)
                    containing_folder = os.path.basename(os.path.dirname(os.path.dirname(root)))
                    containing_folder = re.sub(r'^evoConf_', '', containing_folder)
                    if plot_type not in types:
                        types[plot_type] = {}
                    if containing_folder not in types[plot_type]:
                        types[plot_type][containing_folder] = []
                    types[plot_type][containing_folder].append(full_path)
    return types

def create_thumbnails(pdfs, thumbnail_size):
    thumbnails = []
    for pdf in pdfs:
        first_page = convert_from_path(pdf, first_page=1, last_page=1)[0]
        aspect_ratio = first_page.width / first_page.height
        if aspect_ratio > thumbnail_size[0] / thumbnail_size[1]:
            scaled_width = thumbnail_size[0]
            scaled_height = int(thumbnail_size[0] / aspect_ratio)
        else:
            scaled_height = thumbnail_size[1]
            scaled_width = int(thumbnail_size[1] * aspect_ratio)

        thumbnail = first_page.resize((scaled_width, scaled_height), Image.LANCZOS)
        
        # Create a new image with white background and adjusted bottom padding
        full_thumb = Image.new('RGB', (thumbnail_size[0], thumbnail_size[1]), (255, 255, 255))
        full_thumb.paste(thumbnail, ((thumbnail_size[0] - scaled_width) // 2,
                                     (thumbnail_size[1] - scaled_height) // 2))
        thumbnails.append(full_thumb)
    return thumbnails

def make_contact_sheet(files, output_name, thumbnail_size, margin, cols):
    images = []
    labels = []

    # Collecting images and labels
    for label, pdf_files in files.items():
        thumbnails = create_thumbnails(pdf_files, thumbnail_size)
        images.extend(thumbnails)
        labels.extend([label.replace('_', ' ')] * len(thumbnails))

    num_images = len(images)
    if num_images == 0:
        return

    rows = (num_images + cols - 1) // cols
    page_width = cols * (thumbnail_size[0] + margin) + margin
    page_height = rows * (thumbnail_size[1] + margin + 25) + margin

    c = canvas.Canvas(output_name, pagesize=(page_width, page_height))
    c.setPageSize((page_width, page_height))

    x = margin
    y = page_height - thumbnail_size[1] - margin

    # Draw each thumbnail and its label
    for i in range(num_images):
        c.drawInlineImage(images[i], x, y, width=thumbnail_size[0], height=thumbnail_size[1])

        label_max_width = thumbnail_size[0] - (2 * margin)
        wrapped_lines = wrap_label(labels[i], label_max_width, c._fontname, c._fontsize)

        # Adjusting labels to move them closer to the thumbnails
        for j, line in enumerate(wrapped_lines):
            c.drawString(x, y + 60 - (j + 1) * 12, line)  # Your specific adjustment

        x += thumbnail_size[0] + margin
        if x + thumbnail_size[0] > page_width - margin:
            x = margin
            y -= thumbnail_size[1] + margin + (len(wrapped_lines) * 12) + 80  # Adjusted additional spacing

    c.save()

def wrap_label(label, max_width, font_name, font_size):
    wrapped_lines = []
    words = label.split(' ')
    line = ""
    for word in words:
        test_line = line + word + " "
        if stringWidth(test_line, font_name, font_size) <= max_width:
            line = test_line
        else:
            wrapped_lines.append(line.strip())
            line = word + " "
    if line:
        wrapped_lines.append(line.strip())
    return wrapped_lines

def main(root_dir, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    pdf_types = search_pdfs(root_dir)

    for plot_type, files in pdf_types.items():
        output_name = os.path.join(output_dir, f"{plot_type}_contact_sheet.pdf")
        make_contact_sheet(files, output_name, (200, 300), 20, 4)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate contact sheets from PDF plots.")
    parser.add_argument("root_directory", help="The root directory containing the PDF plot files.")
    parser.add_argument("output_directory", help="The directory where the contact sheet PDFs will be saved.")
    
    args = parser.parse_args()
    
    # Usage example:
    # python plot_contact_sheets.py /path/to/root_directory /path/to/output_directory
    
    main(args.root_directory, args.output_directory)
