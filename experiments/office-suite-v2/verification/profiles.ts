/** Workload descriptions, not a workbook engine or formula oracle. */
export const SHEET_PROFILE = Object.freeze({ rows:10000, columns:100, populatedCells:50000, formulaCells:10000, sheetCount:2 });
export function* sheetInputs(): Generator<{row:number;column:number;kind:'literal'|'formula';value:number|string}> {
  // Five populated columns per row. Column E depends only on same-row A:D.
  for (let row=0;row<SHEET_PROFILE.rows;row++) {
    for (let column=0;column<4;column++) yield {row,column,kind:'literal',value:row+column+1};
    yield {row,column:4,kind:'formula',value:`=SUM(A${row+1}:D${row+1})`};
  }
}
export interface NativeFixtureNode {
  stype:string; text?:string; attributes?:Record<string,unknown>; content?:NativeFixtureNode[];
}
export function wordDocument(pages:100|300|1):NativeFixtureNode {
  const blocks:NativeFixtureNode[]=[];
  for(let page=0;page<pages;page++) for(let paragraph=0;paragraph<8;paragraph++) {
    blocks.push({stype:'paragraph',attributes:{styleId:'Body',...(page>0 && paragraph===0 ? {pageBreakBefore:true}: {})},
      content:[{stype:'inline-text',text:`Page ${page+1}, paragraph ${paragraph+1}. Synthetic layout sample. 한글 문서와 Latin text의 줄바꿈을 측정합니다. ` .repeat(2)}]});
  }
  return {stype:'document',attributes:{},content:[
    {stype:'docMeta',attributes:{},content:[{stype:'docTitle',attributes:{},content:[{stype:'inline-text',text:`M0 Word ${pages} pages`}]}]},
    {stype:'surface',attributes:{kind:'flow',name:'Synthetic section',pageWidth:12240,pageHeight:15840,marginTop:1440,marginBottom:1440,marginLeft:1440,marginRight:1440},content:blocks}]};
}
