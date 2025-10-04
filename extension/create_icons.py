#!/usr/bin/env python3
"""
Simple icon generator for the Firefox extension.
Creates basic placeholder icons if PIL is available.
"""

try:
    from PIL import Image, ImageDraw, ImageFont
    
    def create_icon(size, filename):
        # Create a blue background
        img = Image.new('RGB', (size, size), color='#4A90E2')
        draw = ImageDraw.Draw(img)
        
        # Draw white "RT" text (RSS Tag)
        try:
            # Try to use a default font
            font_size = size // 2
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()
        
        text = "RT"
        # Get text size for centering
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        position = ((size - text_width) // 2, (size - text_height) // 2 - 2)
        draw.text(position, text, fill='white', font=font)
        
        img.save(filename)
        print(f"Created {filename}")
    
    # Create icons
    create_icon(16, 'icons/icon-16.png')
    create_icon(48, 'icons/icon-48.png')
    create_icon(96, 'icons/icon-96.png')
    
    print("Icons created successfully!")
    
except ImportError:
    print("PIL/Pillow not available. Please create icon files manually:")
    print("  - icons/icon-16.png (16x16)")
    print("  - icons/icon-48.png (48x48)")
    print("  - icons/icon-96.png (96x96)")
    print("\nYou can install Pillow with: pip install Pillow")
