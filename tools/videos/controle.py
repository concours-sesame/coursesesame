import json,sys,re,difflib
from faster_whisper import WhisperModel
d=json.load(open(sys.argv[1])); v=sys.argv[2]
ref=' '.join(re.sub(r'\*(.+?)\*',r'\1',p) for sc in d['scenes'] for p in sc['dit'])
m=WhisperModel('small',device='cpu',compute_type='int8')
segs,_=m.transcribe(v,language='fr'); hyp=' '.join(s.text.strip() for s in segs)
n=lambda x:re.findall(r"[a-zàâçéèêëîïôûùüÿœ0-9]+",x.lower().replace('’',"'"))
a,b=n(ref),n(hyp); sm=difflib.SequenceMatcher(None,a,b)
print('concordance %.1f %%'%(100*sm.ratio()))
for op,i1,i2,j1,j2 in sm.get_opcodes():
    if op!='equal': print(op,'|',' '.join(a[i1:i2]),'->',' '.join(b[j1:j2]))
