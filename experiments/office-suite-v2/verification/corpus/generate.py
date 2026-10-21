"""Deterministic, synthetic Office fixtures. CC0-1.0. No third-party content.
This generator is an OPC writer, not an Office compatibility oracle.
"""
from pathlib import Path
import hashlib
import json
import struct
import zlib
from zipfile import ZIP_STORED, ZipFile, ZipInfo

ROOT = Path(__file__).resolve().parent
R = 'http://schemas.openxmlformats.org/package/2006/relationships'
O = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
S = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
A = 'http://schemas.openxmlformats.org/drawingml/2006/main'


def png():
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 2, 2, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(b'\0\xff\0\0\0\xff\0\0\0\0\xff\xff\xff\xff')) + chunk(b'IEND', b'')


def rels(entries):
    return f'<Relationships xmlns="{R}">' + ''.join(f'<Relationship Id="{i}" Type="{O}/{kind}" Target="{target}"/>' for i, kind, target in entries) + '</Relationships>'


def package(name, main, kind, parts, types):
    content = '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>'
    content += ''.join(f'<Override PartName="/{path}" ContentType="{mime}"/>' for path, mime in types)
    content += '</Types>'
    parts = {**parts, '[Content_Types].xml': content, '_rels/.rels': rels([('rId1', 'officeDocument', main)])}
    with ZipFile(ROOT / name, 'w', compression=ZIP_STORED) as out:
        for path, data in sorted(parts.items()):
            entry = ZipInfo(path, (2000, 1, 1, 0, 0, 0))
            entry.compress_type = ZIP_STORED
            entry.external_attr = 0o100644 << 16
            out.writestr(entry, data.encode('utf-8') if isinstance(data, str) else data)
    data = (ROOT / name).read_bytes()
    return {'file': name, 'format': kind, 'sha256': hashlib.sha256(data).hexdigest(), 'bytes': len(data), 'parts': sorted(parts)}


def wp(text):
    return f'<w:p><w:r><w:t>{text}</w:t></w:r></w:p>'


def docx():
    image = '<w:p><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="190500" cy="190500"/><wp:docPr id="1" name="Synthetic squares"/><a:graphic xmlns:a="' + A + '"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="1" name="Synthetic"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="190500" cy="190500"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>'
    table = '<w:tbl><w:tblPr><w:tblW w:w="9000" w:type="dxa"/></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="4500"/></w:tblGrid>'
    table += '<w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/></w:tcPr>' + wp('Merged header / 병합 제목') + '</w:tc></w:tr>'
    for i in range(75):
        table += '<w:tr><w:tc>' + wp(f'Row {i+1} / 행') + '</w:tc><w:tc>' + wp('Synthetic multipage table content / 여러 페이지 표') + '</w:tc></w:tr>'
    table += '</w:tbl>'
    body = wp('Office M0 / 한글 Latin 123') + '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Numbered synthetic item</w:t></w:r></w:p>' + image + table
    body += '<w:p><w:r><w:t>Footnote anchor</w:t></w:r><w:r><w:footnoteReference w:id="1"/></w:r></w:p>'
    body += '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>'
    parts = {'word/document.xml': f'<w:document xmlns:w="{W}" xmlns:r="{O}"><w:body>{body}</w:body></w:document>',
      'word/_rels/document.xml.rels': rels([('rIdImage','image','media/squares.png'), ('rIdHeader','header','header1.xml'), ('rIdFooter','footer','footer1.xml'), ('rIdNotes','footnotes','footnotes.xml'), ('rIdNumber','numbering','numbering.xml')]),
      'word/media/squares.png': png(), 'word/header1.xml': f'<w:hdr xmlns:w="{W}">{wp("Synthetic header")}</w:hdr>',
      'word/footer1.xml': f'<w:ftr xmlns:w="{W}">{wp("Synthetic footer")}</w:ftr>',
      'word/footnotes.xml': f'<w:footnotes xmlns:w="{W}"><w:footnote w:id="-1" w:type="separator"><w:p><w:r><w:separator/></w:r></w:p></w:footnote><w:footnote w:id="0" w:type="continuationSeparator"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote><w:footnote w:id="1">{wp("Synthetic footnote / 각주")}</w:footnote></w:footnotes>',
      'word/numbering.xml': f'<w:numbering xmlns:w="{W}"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>'}
    types = [('word/document.xml','application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml')]
    types += [(f'word/{path}.xml',f'application/vnd.openxmlformats-officedocument.wordprocessingml.{suffix}+xml') for path,suffix in [('header1','header'),('footer1','footer'),('footnotes','footnotes'),('numbering','numbering')]]
    record = package('word-features.docx','word/document.xml','DOCX',parts,types)
    record['features'] = ['Korean/Latin text','numbered list','merged 76-row multipage table','PNG image','header','footer','footnote']
    return record


def xlsx(date1904):
    rows = '<row r="1"><c r="A1"><v>3</v></c><c r="B1"><v>25</v></c><c r="C1"><f>A1*B1</f><v>75</v></c><c r="D1" t="inlineStr"><is><t>한글 Latin</t></is></c><c r="E1" t="b"><v>1</v></c></row>'
    rows += '<row r="2"><c r="A2" s="1"><v>61</v></c><c r="B2" t="e"><v>#DIV/0!</v></c><c r="C2"><f>SUM(A1:B1)</f><v>28</v></c><c r="D2"><f>IF(A1&gt;0,\'Other\'!$A$1,0)</f><v>7</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>Merged / 병합</t></is></c><c r="C3"><f>$A1+A$1+$A$1</f><v>9</v></c></row>'
    parts = {'xl/workbook.xml': f'<workbook xmlns="{S}" xmlns:r="{O}"><workbookPr date1904="{1 if date1904 else 0}"/><sheets><sheet name="Main" sheetId="1" r:id="rId1"/><sheet name="Other" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
      'xl/_rels/workbook.xml.rels': rels([('rId1','worksheet','worksheets/sheet1.xml'),('rId2','worksheet','worksheets/sheet2.xml'),('rId3','styles','styles.xml')]),
      'xl/worksheets/sheet1.xml': f'<worksheet xmlns="{S}"><dimension ref="A1:E3"/><sheetData>{rows}</sheetData><mergeCells count="1"><mergeCell ref="A3:B3"/></mergeCells></worksheet>',
      'xl/worksheets/sheet2.xml': f'<worksheet xmlns="{S}"><sheetData><row r="1"><c r="A1"><v>7</v></c></row></sheetData></worksheet>',
      'xl/styles.xml': f'<styleSheet xmlns="{S}"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'}
    types = [('xl/workbook.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'), ('xl/styles.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml')]
    types += [(f'xl/worksheets/sheet{i}.xml','application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml') for i in (1,2)]
    record = package(f'sheet-{1904 if date1904 else 1900}.xlsx','xl/workbook.xml','XLSX',parts,types)
    record['features'] = ['numbers','inline text','boolean','error','date serial 61','date system '+str(1904 if date1904 else 1900),'SUM/IF/arithmetic','mixed and cross-sheet references','merge','two sheets']
    record['cached_values'] = 'Hand-authored expected literals for this synthetic fixture; never proof of external recalculation.'
    return record


def pptx():
    group_props = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="5143500"/><a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="5143500"/></a:xfrm></p:grpSpPr>'
    shape = '<p:sp><p:nvSpPr><p:cNvPr id="2" name="Synthetic text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="914400" y="914400"/><a:ext cx="5000000" cy="1000000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>Office M0 / 한글 Latin</a:t></a:r></a:p></p:txBody></p:sp>'
    pic = '<p:pic><p:nvPicPr><p:cNvPr id="4" name="Synthetic squares"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="rIdImage"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr><a:xfrm><a:off x="914400" y="2000000"/><a:ext cx="914400" cy="914400"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
    # A minimal layout/master/theme chain makes the fixture consumable by actual presentation readers.
    theme = f'<a:theme xmlns:a="{A}" name="Synthetic"><a:themeElements><a:clrScheme name="Synthetic">' + ''.join(f'<a:{key}><a:srgbClr val="{val}"/></a:{key}>' for key,val in [('dk1','000000'),('lt1','FFFFFF'),('dk2','222222'),('lt2','EEEEEE'),('accent1','445566'),('accent2','667788'),('accent3','8899AA'),('accent4','AABBCC'),('accent5','CCDDEE'),('accent6','EECCAA'),('hlink','0000FF'),('folHlink','800080')]) + '</a:clrScheme><a:fontScheme name="Synthetic"><a:majorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Arial"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Synthetic"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst>' + '<a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:prstDash val="solid"/></a:ln>'*3 + '</a:lnStyleLst><a:effectStyleLst>' + '<a:effectStyle><a:effectLst/></a:effectStyle>'*3 + '</a:effectStyleLst><a:bgFillStyleLst>' + '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'*3 + '</a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>'
    ns = f'xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{O}"'
    parts = {'ppt/presentation.xml': f'<p:presentation {ns}><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rIdMaster"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rIdSlide"/></p:sldIdLst><p:sldSz cx="9144000" cy="5143500"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>',
      'ppt/_rels/presentation.xml.rels': rels([('rIdSlide','slide','slides/slide1.xml'),('rIdMaster','slideMaster','slideMasters/slideMaster1.xml')]),
      'ppt/slides/slide1.xml': f'<p:sld {ns}><p:cSld><p:spTree>{group_props}{shape}<p:grpSp><p:nvGrpSpPr><p:cNvPr id="3" name="Synthetic group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="9144000" cy="5143500"/><a:chOff x="0" y="0"/><a:chExt cx="9144000" cy="5143500"/></a:xfrm></p:grpSpPr>{pic}</p:grpSp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>',
      'ppt/slides/_rels/slide1.xml.rels': rels([('rIdImage','image','../media/squares.png'),('rIdLayout','slideLayout','../slideLayouts/slideLayout1.xml')]),
      'ppt/slideLayouts/slideLayout1.xml': f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group_props}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>',
      'ppt/slideLayouts/_rels/slideLayout1.xml.rels': rels([('rIdMaster','slideMaster','../slideMasters/slideMaster1.xml')]),
      'ppt/slideMasters/slideMaster1.xml': f'<p:sldMaster {ns}><p:cSld><p:spTree>{group_props}</p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rIdLayout"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>',
      'ppt/slideMasters/_rels/slideMaster1.xml.rels': rels([('rIdLayout','slideLayout','../slideLayouts/slideLayout1.xml'),('rIdTheme','theme','../theme/theme1.xml')]),
      'ppt/theme/theme1.xml': theme, 'ppt/media/squares.png': png()}
    types = [(f'ppt/{path}',f'application/vnd.openxmlformats-officedocument.presentationml.{kind}+xml') for path,kind in [('presentation.xml','presentation.main'),('slides/slide1.xml','slide'),('slideMasters/slideMaster1.xml','slideMaster'),('slideLayouts/slideLayout1.xml','slideLayout')]]
    types += [('ppt/theme/theme1.xml','application/vnd.openxmlformats-officedocument.theme+xml')]
    record = package('slides-features.pptx','ppt/presentation.xml','PPTX',parts,types)
    record['features'] = ['Korean/Latin text','rectangle','PNG image','group','layout/master/theme relationships']
    return record


def main():
    fixtures = [docx(), xlsx(False), xlsx(True), pptx()]
    manifest = {'schema':'office-v2-m0/corpus-v1','license':'CC0-1.0','generator':'generate.py','origin':'All content and 2x2 PNG authored synthetically for this probe. No third-party templates or user files.','fixtures':fixtures,'evidence_limit':'OPC/XML validation is fixture integrity only. Product import/export and separately identified reader execution need separate receipts.'}
    (ROOT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'status':'generated','files':[f['file'] for f in fixtures]},indent=2))


if __name__ == '__main__':
    main()
