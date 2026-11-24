# Chroma-keys the generated green-screen PNGs into the WebP assets in public/assets.
# Usage: python3 scripts/prepare_assets.py <dir-with-raw-pngs>
import numpy as np, sys, json
from PIL import Image, ImageFilter
import os
RAW=sys.argv[1] if len(sys.argv)>1 else "."
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","public","assets")
def key(path):
    a=np.asarray(Image.open(os.path.join(RAW,path)).convert("RGB")).astype(np.float32)
    r,g,b=a[...,0],a[...,1],a[...,2]
    green=g-np.maximum(r,b)
    alpha=1-np.clip((green-40)/(120-40),0,1)
    m=np.maximum(r,b)
    g2=np.minimum(g,m)  # despill
    out=np.dstack([r,g2,b,alpha*255]).clip(0,255).astype(np.uint8)
    im=Image.fromarray(out,"RGBA")
    al=im.getchannel("A").filter(ImageFilter.MinFilter(5)).filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(al)
    return im
def crop(im,pad=4):
    bb=im.getchannel("A").point(lambda v:255 if v>8 else 0).getbbox()
    x0,y0,x1,y1=bb
    return im.crop((max(0,x0-pad),max(0,y0-pad),min(im.width,x1+pad),min(im.height,y1+pad)))
coats=["kuro","mugi","hana","shiro","saba","hachi","sabi","gray","kiji","siam","ragdoll","siberian","norwegian"]
meta={}
for c in coats:
    body=crop(key(c+".png")); 
    s=1200/body.width; body=body.resize((1200,round(body.height*s)),Image.LANCZOS)
    body.save(f"{OUT}/{c}.webp",quality=86,method=6)
    tail=crop(key(c+"-tail.png"))
    s=760/tail.width; tail=tail.resize((760,round(tail.height*s)),Image.LANCZOS)
    tail.save(f"{OUT}/{c}-tail.webp",quality=86,method=6)
    # swatch from body center
    w,h=body.size; sw=body.crop((int(w*.12),int(h*.15),int(w*.12)+int(h*.7),int(h*.85))).convert("RGB").resize((96,96),Image.LANCZOS)
    sw.save(f"{OUT}/{c}-swatch.webp",quality=85)
    meta[c]={"body":list(body.size),"tail":list(tail.size)}
hand=crop(key("hand.png")); s=1000/hand.height; hand=hand.resize((round(hand.width*s),1000),Image.LANCZOS); hand.save(f"{OUT}/hand.webp",quality=88,method=6)
meta["hand"]=list(hand.size)
Image.open(os.path.join(RAW,"room.png")).convert("RGB").save(f"{OUT}/room.webp",quality=82,method=6)
print(json.dumps(meta))
