from PIL import Image

SRC = Image.open("mbe_favicon.png").convert("RGBA")

# recorta a margem transparente p/ pegar o "M" justo
bbox = SRC.getbbox()
M = SRC.crop(bbox)

def build(bg_color, name, margin=0.16, shadow=False):
    S = 512
    icon = Image.new("RGBA", (S, S), bg_color)
    # área útil
    avail = int(S * (1 - 2*margin))
    w, h = M.size
    scale = min(avail / w, avail / h)
    nw, nh = int(w*scale), int(h*scale)
    m = M.resize((nw, nh), Image.LANCZOS)
    x = (S - nw)//2
    y = (S - nh)//2
    icon.alpha_composite(m, (x, y))
    icon.convert("RGB").save(name)
    print("salvo", name)

build((255,255,255,255), "mbe-icon-branco.png", margin=0.17)
build((4,56,104,255),    "mbe-icon-navy.png",   margin=0.17)   # #043868
build((253,252,249,255), "mbe-icon-creme.png",  margin=0.17)   # #FDFCF9
print("ok")
