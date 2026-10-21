"""Fixture integrity checks only. Does not assert product or Office support."""
from pathlib import Path, PurePosixPath
from zipfile import ZipFile
import hashlib
import json
import posixpath
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
R = '{http://schemas.openxmlformats.org/package/2006/relationships}'
S = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

class CorpusIntegrity(unittest.TestCase):
    def test_regeneration_is_byte_identical(self):
        before = {p.name: p.read_bytes() for p in ROOT.iterdir() if p.suffix in ('.docx','.xlsx','.pptx') or p.name == 'manifest.json'}
        subprocess.run([sys.executable, str(ROOT/'generate.py')], check=True, capture_output=True)
        self.assertEqual(before, {name: (ROOT/name).read_bytes() for name in before})

    def test_parts_hashes_and_relationships(self):
        manifest = json.loads((ROOT/'manifest.json').read_text())
        self.assertEqual(len(manifest['fixtures']), 4)
        for fixture in manifest['fixtures']:
            with self.subTest(file=fixture['file']):
                raw = (ROOT/fixture['file']).read_bytes()
                self.assertEqual(hashlib.sha256(raw).hexdigest(), fixture['sha256'])
                with ZipFile(ROOT/fixture['file']) as archive:
                    names = archive.namelist()
                    self.assertEqual(sorted(names), fixture['parts'])
                    self.assertEqual(len(names), len(set(names)))
                    for name in names:
                        self.assertFalse(name.startswith('/'))
                        self.assertNotIn('..', PurePosixPath(name).parts)
                        if name.endswith(('.xml','.rels')):
                            root = ET.fromstring(archive.read(name))
                            if name.endswith('.rels'):
                                source_directory = '' if name == '_rels/.rels' else str(PurePosixPath(name).parent.parent)
                                ids = set()
                                for relation in root.findall(R+'Relationship'):
                                    self.assertNotIn(relation.attrib['Id'], ids)
                                    ids.add(relation.attrib['Id'])
                                    self.assertNotEqual(relation.get('TargetMode'), 'External')
                                    target = posixpath.normpath(posixpath.join(source_directory, relation.attrib['Target']))
                                    self.assertIn(target, names)

    def test_sheet_semantics_are_explicit_in_both_date_systems(self):
        for year in (1900,1904):
            with ZipFile(ROOT/f'sheet-{year}.xlsx') as archive:
                workbook = ET.fromstring(archive.read('xl/workbook.xml'))
                self.assertEqual(workbook.find(S+'workbookPr').attrib['date1904'], str(int(year == 1904)))
                self.assertEqual(len(workbook.find(S+'sheets')), 2)
                sheet = ET.fromstring(archive.read('xl/worksheets/sheet1.xml'))
                cells = {c.attrib['r']:c for c in sheet.iter(S+'c')}
                self.assertEqual(cells['D2'].find(S+'f').text,"IF(A1>0,'Other'!$A$1,0)")
                self.assertEqual(cells['A2'].find(S+'v').text, '61')
                self.assertEqual(cells['B2'].attrib['t'], 'e')
                self.assertEqual(sheet.find(S+'mergeCells')[0].attrib['ref'], 'A3:B3')

if __name__ == '__main__':
    unittest.main(verbosity=2)
