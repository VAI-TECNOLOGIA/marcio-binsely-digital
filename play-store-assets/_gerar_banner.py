from PIL import Image, ImageDraw, ImageFont

W,H = 1024,500
NAVY=(4,56,104); GOLD=(247,168,16); CREAM_A=(253,252,249); CREAM_B=(238,240,244)
img = Image.new("RGB",(W,H),CREAM_A)
d = ImageDraw.Draw(img)
# gradiente creme suave (diagonal)
for y in range(H):
    t=y/H
    d.line([(0,y),(W,y)],fill=(int(CREAM_A[0]*(1-t)+CREAM_B[0]*t),
                               int(CREAM_A[1]*(1-t)+CREAM_B[1]*t),
                               int(CREAM_A[2]*(1-t)+CREAM_B[2]*t)))
# marca d'água M grande, bem sutil, canto direito
M = Image.open("mbe_favicon.png").convert("RGBA")
Mb=M.crop(M.getbbox())
wm=Mb.resize((520,int(520*Mb.height/Mb.width)),Image.LANCZOS)
wm_faint=Image.new("RGBA",wm.size,(0,0,0,0))
for x in range(wm.width):
    for y in range(wm.height):
        r,g,b,a=wm.getpixel((x,y))
        wm_faint.putpixel((x,y),(r,g,b,int(a*0.10)))
img.paste(wm_faint,(W-360,H-260),wm_faint)

# barras de acento
d.rectangle([0,0,W,10],fill=NAVY)
d.rectangle([0,H-12,W,H],fill=GOLD)

# lockup principal
lk=Image.open("mbe_logo_maior.png").convert("RGBA")
lk=lk.crop(lk.getbbox())
lw=int(W*0.78); lh=int(lw*lk.height/lk.width)
lk=lk.resize((lw,lh),Image.LANCZOS)
lx=(W-lw)//2; ly=int(H*0.30)-lh//2+20
img.paste(lk,(lx,ly),lk)

# tagline
def font(sz,idx=1):
    for p,i in [("/System/Library/Fonts/Avenir Next Condensed.ttc",7),
                ("/System/Library/Fonts/HelveticaNeue.ttc",1),
                ("/System/Library/Fonts/Helvetica.ttc",1)]:
        try: return ImageFont.truetype(p,sz,index=i)
        except: pass
    return ImageFont.load_default()
f=font(int(H*0.11))
t1="É TRABALHO. "; t2="É RIO GRANDE."
bb1=d.textbbox((0,0),t1,font=f); bb2=d.textbbox((0,0),t2,font=f)
tw=(bb1[2]-bb1[0])+(bb2[2]-bb2[0])
tx=(W-tw)//2; ty=int(H*0.66)
d.text((tx,ty),t1,font=f,fill=NAVY)
d.text((tx+(bb1[2]-bb1[0]),ty),t2,font=f,fill=GOLD)

img.save("mbe-feature-1024x500.png")
print("ok", img.size)
