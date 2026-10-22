# Synthèse de chaque phrase (Kokoro, voix ff_siwis) : python voix.py script.json dossier
import json,sys,re,os
from kokoro_onnx import Kokoro
import soundfile as sf
V=os.environ.get('KOKORO_DIR',os.path.dirname(os.path.abspath(__file__))+'/modeles')+'/'
k=Kokoro(V+'kokoro.onnx',V+'voices.bin')
d=json.load(open(sys.argv[1])); out=sys.argv[2]; os.makedirs(out,exist_ok=True)
res=[]
for i,sc in enumerate(d['scenes']):
    for j,p in enumerate(sc['dit']):
        t=re.sub(r'\*(.+?)\*',r'\1',p).replace('« ','').replace(' »','')
        s,sr=k.create(t,voice='ff_siwis',speed=0.95,lang='fr-fr')
        f=f'{out}/{i:02d}-{j:02d}.wav'; sf.write(f,s,sr); res.append([i,j,f,len(s)/sr])
json.dump(res,open(out+'/durees.json','w'))
print(len(res),'phrases',round(sum(x[3] for x in res),1),'s')
