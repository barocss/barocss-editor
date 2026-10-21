"""Open only synthetic probe files in installed Office; never save or quit an app.
AppleScript object inspection is separate from rendered/round-trip acceptance.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import plistlib
import subprocess
import time

ROOT=Path(__file__).resolve().parent
parser=argparse.ArgumentParser()
parser.add_argument('--reader',choices=['Word','Excel','PowerPoint'],required=True)
parser.add_argument('--fixture',required=True)
args=parser.parse_args()
fixture=(ROOT/args.fixture).resolve()
assert fixture.is_relative_to(ROOT) and fixture.suffix in ('.docx','.xlsx','.pptx')
assert fixture.exists()
app='Microsoft '+args.reader
info=plistlib.loads((Path('/Applications')/(app+'.app')/'Contents/Info.plist').read_bytes())
base='''on run argv
set inputPath to item 1 of argv
tell application "APP"
set fixtureDoc to missing value
try
BODY
set resultText to "readerVersion=" & version & linefeed & "document=" & name of fixtureDoc & linefeed & details
close fixtureDoc saving no
return resultText
on error errorText number errorNumber
if fixtureDoc is not missing value then
try
close fixtureDoc saving no
end try
end if
error errorText number errorNumber
end try
end tell
end run'''
if args.reader=='Excel':
 body='''set fixtureDoc to open workbook workbook file name inputPath read only true update links do not update links add to mru false
set sheetOne to worksheet "Main" of fixtureDoc
set details to "sheets=" & (count worksheets of fixtureDoc) & linefeed & "date1904=" & (date 1904 of fixtureDoc) & linefeed & "C1=" & (value of range "C1" of sheetOne) & linefeed & "C2=" & (value of range "C2" of sheetOne) & linefeed & "D2=" & (value of range "D2" of sheetOne) & linefeed & "C3=" & (value of range "C3" of sheetOne) & linefeed & "D2formula=" & (formula of range "D2" of sheetOne)'''
elif args.reader=='Word':
 body='''set fixtureDoc to open (POSIX file inputPath) read only true add to recent files false
set bodyText to content of text object of fixtureDoc
set details to "tables=" & (count tables of fixtureDoc) & linefeed & "footnotes=" & (count footnotes of fixtureDoc) & linefeed & "inlineImages=" & (count inline shapes of fixtureDoc) & linefeed & "firstText=" & (text 1 thru (minLength(length of bodyText, 100)) of bodyText)'''
 # Avoid a helper call in the app tell scope; substring is fixed and fixture text is long.
 body=body.replace('(minLength(length of bodyText, 100))','100')
else:
 body='''set openedResult to open (POSIX file inputPath)
set fixtureDoc to presentation (name of (info for (POSIX file inputPath)))
set details to "slides=" & (count slides of fixtureDoc) & linefeed & "shapes=" & (count shapes of slide 1 of fixtureDoc)'''
script=base.replace('APP',app).replace('BODY',body)
sha=lambda:hashlib.sha256(fixture.read_bytes()).hexdigest()
report={'schema':'office-v2-m0/native-office-probe-v1','capturedUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reader':app,'installedVersion':info.get('CFBundleShortVersionString'),'fixture':str(fixture.relative_to(ROOT)),'inputSha256':sha(),'script':script,'status':'NOT RUN','boundary':'Actual application object inspection only. Not visual fidelity, exported edited-copy support, product import, or full Office acceptance.'}
started=time.monotonic()
try:
 completed=subprocess.run(['/usr/bin/osascript','-',str(fixture)],input=script,text=True,capture_output=True,timeout=25)
 report.update(exitCode=completed.returncode,stdout=completed.stdout,stderr=completed.stderr,status='PASS: native open/object probe' if completed.returncode==0 else 'FAIL: native probe')
except subprocess.TimeoutExpired as error:
 report.update(status='NOT RUN: native open not confirmed',firstFailure='AppleScript did not finish within25s; application may require interaction. No app/process stopped.',stdout=error.stdout.decode() if isinstance(error.stdout,bytes) else error.stdout,stderr=error.stderr.decode() if isinstance(error.stderr,bytes) else error.stderr)
report.update(elapsedSeconds=time.monotonic()-started,originalBytesUnchanged=sha()==report['inputSha256'])
if report.get('exitCode') == 0:
    values=dict(line.split('=',1) for line in report['stdout'].splitlines() if '=' in line)
    if args.reader=='Excel':
        checks={'twoSheets':values.get('sheets')=='2','dateSystem':values.get('date1904')==str('1904' in fixture.stem).lower(),
                'formulaValues':all(float(values.get(k,'nan'))==v for k,v in [('C1',75),('C2',28),('D2',7),('C3',9)])}
    elif args.reader=='Word':
        is_original=fixture.name=='word-features.docx'
        checks={'table':values.get('tables')=='1','footnotes':values.get('footnotes')==('1' if is_original else '0'),
                'inlineImage':values.get('inlineImages')==('1' if is_original else '0'),'KoreanLatin':'Office M0 / 한글 Latin 123' in values.get('firstText','')}
    else:
        checks={'oneSlide':values.get('slides')=='1','shapeAndGroup':values.get('shapes')=='2'}
    checks['originalBytesUnchanged']=report['originalBytesUnchanged']
    report['checks']=checks
    report['status']='PASS: bounded native open/object checks' if all(checks.values()) else 'FAIL: bounded native object mismatch'

output=ROOT/'reports'/f'native-{args.reader.lower()}-{fixture.stem}.json'
output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
