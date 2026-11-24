# Chroma-keys the generated green-screen PNGs into the WebP assets in public/assets.
# Usage: python3 scripts/prepare_assets.py <dir-with-raw-pngs>
import numpy as np, sys, json
from PIL import Image, ImageFilter
import os
RAW=sys.argv[1] if len(sys.argv)>1 else "."
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","public","assets")
def key(path):
    a=np.asarray(Image.open(os.path.join(RAW,path)).convert("RGB")).astype(np.float32)
    h,w,_=a.shape
    bg=np.median(np.concatenate([a[:8,:8].reshape(-1,3),a[:8,-8:].reshape(-1,3),a[-8:,:8].reshape(-1,3),a[-8:,-8:].reshape(-1,3)]),axis=0)
    green=a[...,1]-np.maximum(a[...,0],a[...,2])
    bg_green=bg[1]-max(bg[0],bg[2])
    alpha=1-np.clip((green-12)/(bg_green*0.9-12),0,1)
    # unmix the key colour from partially transparent edge pixels
    fg=(a-(1-alpha[...,None])*bg)/np.maximum(alpha[...,None],0.08)
    r,g,b=fg[...,0],fg[...,1],fg[...,2]
    g=np.minimum(g,(r+b)/2+8)
    out=np.dstack([r,g,b,alpha*255]).clip(0,255).astype(np.uint8)
    im=Image.fromarray(out,"RGBA")
    al=im.getchannel("A").filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    im.putalpha(al)
    return im
def match_hue(tail,body):
    t=np.asarray(tail).astype(np.float32); bd=np.asarray(body).astype(np.float32)
    def tone(x):
        m=x[...,3]>250; c=x[m][:,:3].mean(0); return c/c.mean()
    gain=np.clip(tone(bd)/tone(t),0.85,1.15)
    t[...,:3]=np.clip(t[...,:3]*gain,0,255)
    return Image.fromarray(t.astype(np.uint8),"RGBA")
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
    tail=match_hue(crop(key(c+"-tail.png")),body)
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
