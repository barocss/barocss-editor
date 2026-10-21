"""Read installed CoreText face identity/version/URL and file hash. No font bytes exported."""
import ctypes as C
import hashlib
import json
from pathlib import Path
import sys

cf=C.CDLL('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation')
ct=C.CDLL('/System/Library/Frameworks/CoreText.framework/CoreText')
P=C.c_void_p
cf.CFStringCreateWithCString.argtypes=[P,C.c_char_p,C.c_uint32];cf.CFStringCreateWithCString.restype=P
cf.CFStringGetCString.argtypes=[P,C.c_char_p,C.c_long,C.c_uint32];cf.CFStringGetCString.restype=C.c_bool
cf.CFURLCopyFileSystemPath.argtypes=[P,C.c_long];cf.CFURLCopyFileSystemPath.restype=P
cf.CFRelease.argtypes=[P]
ct.CTFontCreateWithName.argtypes=[P,C.c_double,P];ct.CTFontCreateWithName.restype=P
ct.CTFontCopyPostScriptName.argtypes=[P];ct.CTFontCopyPostScriptName.restype=P
ct.CTFontCopyFamilyName.argtypes=[P];ct.CTFontCopyFamilyName.restype=P
ct.CTFontCopyAttribute.argtypes=[P,P];ct.CTFontCopyAttribute.restype=P
ct.CTFontCopyName.argtypes=[P,P];ct.CTFontCopyName.restype=P
UTF8=0x08000100

def string(ref):
    if not ref:return None
    buf=C.create_string_buffer(8192)
    if not cf.CFStringGetCString(ref,buf,len(buf),UTF8):raise ValueError('CoreText string exceeds bounded buffer')
    return buf.value.decode('utf-8')

def constant(name):return P.in_dll(ct,name).value

def describe(name):
    refs=[]
    try:
        requested=cf.CFStringCreateWithCString(None,name.encode('utf-8'),UTF8);refs.append(requested)
        font=ct.CTFontCreateWithName(requested,12,None);refs.append(font)
        ps=ct.CTFontCopyPostScriptName(font);refs.append(ps)
        family=ct.CTFontCopyFamilyName(font);refs.append(family)
        version=ct.CTFontCopyName(font,constant('kCTFontVersionNameKey'));refs.append(version)
        url=ct.CTFontCopyAttribute(font,constant('kCTFontURLAttribute'));refs.append(url)
        path_ref=cf.CFURLCopyFileSystemPath(url,0) if url else None;refs.append(path_ref)
        path=string(path_ref);actual=string(ps)
        row={'requestedPostScriptName':name,'actualPostScriptName':actual,'family':string(family),'version':string(version),'path':path,'exactNameMatched':actual==name}
        if path and Path(path).is_file():
            file=Path(path);row.update(fileBytes=file.stat().st_size,sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        row['qualifiedIdentity']=bool(row['exactNameMatched'] and row['version'] and row.get('sha256'))
        return row
    finally:
        for ref in reversed(refs):
            if ref:cf.CFRelease(ref)

if __name__=='__main__':
    names=json.loads(sys.argv[1])
    if not isinstance(names,list) or len(names)>32 or any(not isinstance(n,str) or not n or len(n)>256 for n in names):raise ValueError('Expected1..32 bounded font names')
    print(json.dumps({'schema':'office-v2-m0/coretext-font-identities-v1','fonts':[describe(n) for n in names]},ensure_ascii=False,indent=2))
