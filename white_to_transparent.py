from PIL import Image
import sys

def main():
    if len(sys.argv) < 3:
        print("Usage: white_to_transparent.py <input> <output>")
        sys.exit(1)
        
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    img = Image.open(input_path)
    img = img.convert("RGBA")
    
    datas = img.getdata()
    
    newData = []
    for item in datas:
        # Check if color is close to white (tolerate pure white and near white)
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)
            
    img.putdata(newData)
    
    # Trim transparent borders
    bbox = img.getbbox()
    if bbox:
        img = img.crop(bbox)
        
    img.save(output_path, "PNG")

if __name__ == '__main__':
    main()
