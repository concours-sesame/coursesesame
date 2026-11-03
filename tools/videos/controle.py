import json,sys,re,difflib,subprocess,numpy as np
from faster_whisper import WhisperModel
d=json.load(open(sys.argv[1])); v=sys.argv[2]
ref=' '.join(re.sub(r'\*(.+?)\*',r'\1',p) for sc in d['scenes'] for p in sc['dit'])
m=WhisperModel('small',device='cpu',compute_type='int8')
# Son décodé par ffmpeg (16 kHz, mono) : évite les écarts de version de la bibliothèque av
pcm=subprocess.run(['ffmpeg','-v','error','-i',v,'-f','f32le','-ac','1','-ar','16000','-'],capture_output=True,check=True).stdout
segs,_=m.transcribe(np.frombuffer(pcm,np.float32),language='fr'); hyp=' '.join(s.text.strip() for s in segs)
n=lambda x:re.findall(r"[a-zàâçéèêëîïôûùüÿœ0-9]+",x.lower().replace('’',"'"))
a,b=n(ref),n(hyp); sm=difflib.SequenceMatcher(None,a,b)
print('concordance %.1f %%'%(100*sm.ratio()))
for op,i1,i2,j1,j2 in sm.get_opcodes():
    if op!='equal': print(op,'|',' '.join(a[i1:i2]),'->',' '.join(b[j1:j2]))
