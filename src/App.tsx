import React, { ChangeEventHandler, WheelEventHandler } from 'react';
import './App.css';
import assert from 'assert';
import { arrayBuffer } from 'stream/consumers';
import ReactDOM from 'react-dom';
import { Root, createRoot } from 'react-dom/client';


// ///////////////// // ------------------------------------------
// HELPER FUNCTIONS //
// /////////////// //
function ToPaddedHex(value:number, digits:number) {
  let hexString = value.toString(16);
  return "0".repeat(Math.max(0, digits - hexString.length)) + hexString;
}
// Convert Uint8Array to hex string
function Uint8ToHex(byte_array:Uint8Array) {
  function i2hex(i:number) { return ('0' + i.toString(16)).slice(-2);}
  return Array.from(byte_array).map(i2hex).join(' ');
}
// ---------------------------------------------------------------



// ////////////////////////////////// // ----------------------------------------------------------------------------------
// TEMP FILE LOADING FUNCTIONALITIES // ----------------------
// //////////////////////////////// // ------------------------------------------------------------------------------------
const FileChunkSize:number = 1024;
const line_height = 19;
class FileProcessor{
  // page config stuff
  byte_offset:number = 0;
  bytes_per_row:number = 10;
  visible_rows:number = 10;
  total_rows:number = 10;
  SetRowWidth(new_width:number){
    this.bytes_per_row = new_width;
    this.total_rows = Math.trunc(this.file.size / this.bytes_per_row);
    // account for any extra data that gets truncated
    if (this.file.size % this.bytes_per_row != 0) this.total_rows += 1; 
  }
  RefreshSize(new_content_view_height:number){
    this.visible_rows = Math.trunc(new_content_view_height / line_height) + 1; // plus one row to account for lost row when truncating
  }
  // file reading stuff
  file:File;
  lowest_offset:number; // first byte of lower chunk
  highest_offset:number; // last byte of upper chunk (unituitively this is actually the offset after the highest accessible byte, it just makes the code need a lot less '-1's)
  lower_chunk:Uint8Array;
  upper_chunk:Uint8Array;
  has_init = false;
 constructor(_file:File){
    this.file = _file;
    this.lower_chunk = new Uint8Array();
    this.upper_chunk = new Uint8Array();
    this.lowest_offset = 0;
    this.highest_offset = FileChunkSize*2;
  }
  async init(){
    this.SetRowWidth(16);
    this.lower_chunk = await this.call_file_read(0);
    this.upper_chunk = await this.call_file_read(FileChunkSize);
    this.has_init = true;
    RefreshFileView();
  }
  async read(offset:number, count:number):Promise<Uint8Array>{
    if (count == 0) throw new Error("dont read 0 bytes");
    if (!this.has_init) throw new Error("reader uninitialized");
    if (count >= FileChunkSize) throw new Error("read size too large");
    // check to make sure at least some of the data falls inside
    if (offset < 0) throw new Error("byte offset below 0");
    let last_offset = offset+count; // actually +1 of the last offset
    
    // drop any overflowing indicies, so we're only attempting to read inside the boundaries of the file
    { let bytes_overflowing = last_offset - this.file.size;
      if (bytes_overflowing > 0){
        count -= bytes_overflowing;
        if (count <= 0) throw new Error("Attempting to read outside of file bounds");
    }}
    // check whether the offset is below currently loaded data
    if (offset < this.lowest_offset){
      let chunk_lowest_offset = Math.trunc(offset / FileChunkSize) * FileChunkSize;
      // if the data exists in the below block we can swap the current lowest chunk to the highest, else just read the upper chunk as well
      if (offset - this.lowest_offset <= FileChunkSize) this.upper_chunk = this.lower_chunk;
      else this.upper_chunk = await this.call_file_read(chunk_lowest_offset + FileChunkSize);
      this.lower_chunk = await this.call_file_read(chunk_lowest_offset);
      this.lowest_offset = chunk_lowest_offset;
      this.highest_offset = chunk_lowest_offset + (FileChunkSize*2);
    }
    // or if it is beyond the loaded data
    else if (last_offset > this.highest_offset){
      let upper_chunk_lowest_offset = Math.trunc(offset / FileChunkSize) * FileChunkSize;
      // if the data exists in the above block we can swap the current highest chunk to the lowest, else just read the lowest chunk as well
      if (this.highest_offset - last_offset <= FileChunkSize) this.lower_chunk = this.upper_chunk;
      else this.lower_chunk = await this.call_file_read(upper_chunk_lowest_offset - FileChunkSize);
      this.upper_chunk = await this.call_file_read(upper_chunk_lowest_offset);
      this.lowest_offset = upper_chunk_lowest_offset - FileChunkSize;
      this.highest_offset = upper_chunk_lowest_offset + FileChunkSize;
    }

    // if the data falls within the first chunk
    let upper_chunk_offset = this.lowest_offset+FileChunkSize;
    let lower_insertion = offset - this.lowest_offset; // not needed in all 3 cases, but to simplify the code
    if (last_offset < upper_chunk_offset)
      return this.lower_chunk.slice(lower_insertion, lower_insertion+count);
    // if the data falls within the second chunk
    else if (offset >= upper_chunk_offset){
      let upper_insertion = offset - upper_chunk_offset;
      return this.lower_chunk.slice(upper_insertion, upper_insertion+count);
    }

    // else the data falls between the two, requiring merging the data
    let bytes_from_lower = upper_chunk_offset - offset;
    let merged = new Uint8Array(count);
    merged.set(this.lower_chunk.slice(lower_insertion, lower_insertion+bytes_from_lower));
    merged.set(this.lower_chunk.slice(0, count - bytes_from_lower));
    return merged;
  }
  private call_file_read(offset:number):Promise<Uint8Array>{
    console.log("reading: " + offset.toString())
    let owner = this;
    function read_promise(){
      return function(resolve: (arg0: Uint8Array) => void) {
        const reader = new FileReader(); // should this be a static or class owned object??
        reader.onload = function (e) {
          const chunk = reader.result;
          if (chunk == null) throw new Error("bad read request");
          resolve(new Uint8Array(chunk as ArrayBuffer));
        };
        const blob = owner.file.slice(offset, offset + FileChunkSize); // this automatically trims the output size to whatever room it can possibly read
        reader.readAsArrayBuffer(blob);
    }}
    return new Promise(read_promise());
  }
}
// file loading UI function
function FileBoxOnChanged(e: { target: HTMLInputElement | null; }){ 
  if (e.target == null) throw("filebox target doesn't exist");
  let input = e.target as HTMLInputElement;
  if (input.files == null || input.files!.length == 0) {return;} // "filebox no files selected"

  let file:File = input.files![0];
  if (file == null){return;} // skip null file
  input.value = ""; // clean input value

  let opened_file = new FileProcessor(file);
  opened_file.init();
  let test = document.getElementById('contentView')!.clientHeight;
  console.log("filepanel size: " + test)
  opened_file.RefreshSize(test);
  open_files.push(opened_file);
};
// -----------------------------------------------------------------------------------------------------------------------


// //////////// //
// GLOBAL DATA //
// ////////// //
var open_files:FileProcessor[] = [];
var active_files:FileProcessor[] = []; // only modified when calling the refresh function







// ////////////// //
// CONTENT VIEWS //
// //////////// //
var has_created_roots = false;
var root_fileview_files:Root|undefined = undefined;
var root_dataview_data:Root|undefined = undefined;
var root_dataview_offsets:Root|undefined = undefined;
function CheckRootHooks(){ // theres probably a way to do this after the document loads, but this is the best i can think of for now
  if (has_created_roots) return;
  root_fileview_files   = createRoot(document.getElementById('FilePanel')!);
  root_dataview_data    = createRoot(document.getElementById('dataView')!);
  root_dataview_offsets = createRoot(document.getElementById('offsetsView')!);
  if (root_fileview_files == undefined)   throw new Error("Failed to find fileview offsets panel")
  if (root_dataview_data == undefined)    throw new Error("Failed to find dataview offsets panel")
  if (root_dataview_offsets == undefined) throw new Error("Failed to find offsetsview offsets panel")
  has_created_roots = true;
}

function RefreshFileView(){
  const FileViewContainer = () => {return(<div>{active_files.map((el, index) => React.createElement("button", { key: index, className: "ToolItem", onClick: FileClick, file_index: index }, el.file.name))}</div>);};
  active_files = []; // first update the active files list, so our indexes correctly correspond
  for (let i = 0; i < open_files.length; i++) if (open_files[i].has_init) active_files.push(open_files[i]);

  CheckRootHooks();
  root_fileview_files!.render(<FileViewContainer />);
}
function FileClick(e:Event){
  if (e.target == null) throw("filebutton target doesn't exist");
  let input = e.target as HTMLButtonElement;
  // get the stored file index attribute
  let index_property = input.getAttribute("file_index");
  if (index_property == null) throw new Error()
  let index = parseInt(index_property);

  // do thing with this file index
  // CHECK IF THIS FILE IS ALREADY OPEN
  LoadBytesView(open_files[index])
}

// cached stuff for later use // so we dont have to regenerate all that data when we scroll up or down
var dataview_offset_spans:HTMLSpanElement[] = [];
var dataview_byte_spans:HTMLSpanElement[] = [];
var active_file:FileProcessor|undefined = undefined;
async function LoadBytesView(file:FileProcessor){
  active_file = file;
  // read & convert all bytes into react span elements
  let byte_spans:React.DetailedReactHTMLElement<{key: number;className: string;}, HTMLElement>[] = [];
  let offset_spans:React.DetailedReactHTMLElement<{key: number;className: string;}, HTMLElement>[] = [];
  let skipped_rows = Math.trunc(active_file.byte_offset/active_file.bytes_per_row);
  let rows_to_show = Math.min(active_file.total_rows - skipped_rows, active_file.visible_rows);
  console.log("showing row: " + (skipped_rows) + "/" + active_file.total_rows);
  for (let line_index = 0; line_index < rows_to_show; line_index++){
    let row_bytes = await active_file.read(active_file.byte_offset+(line_index*active_file.bytes_per_row), active_file.bytes_per_row);
    var row_text_content = Uint8ToHex(row_bytes);
    byte_spans.push(React.createElement("span", { key: line_index, className: "DataSpan" }, row_text_content));
    offset_spans.push(React.createElement("span", { key: line_index, className: "DataSpan" }, ToPaddedHex(active_file.byte_offset + (line_index*active_file.bytes_per_row), 8)));
  }
  // then render data
  CheckRootHooks();
  const DataViewContainer = () => {return(<div>{byte_spans}</div>);};
  const OffsetsViewContainer = () => {return(<div>{offset_spans}</div>);};
  root_dataview_data!.render(<DataViewContainer />);
  root_dataview_offsets!.render(<OffsetsViewContainer />);
}


function ScrollDataView(e:React.WheelEvent<HTMLDivElement>){
  if (active_file == undefined) return;

  if (e.deltaY < 0){
    active_file.byte_offset = Math.max(active_file.byte_offset-active_file.bytes_per_row, 0);
  } else {
    active_file.byte_offset = Math.min(active_file.byte_offset+active_file.bytes_per_row, active_file.file.size-1);
  }
  LoadBytesView(active_file); // we'll do an optimized thing for this
}

// ///////////// //
// UI FUNCTIONS //
// /////////// //
const offset_bytes = 4;


var available_size:number = 0;

var last_row_index:number = NaN;
var last_row_count:number = NaN;

var rows_added_top:number = NaN; // added/removed from the top of the data view
var rows_added_bot:number = NaN; // added/removed from bottom

// main app view
function App() {
  return (
    <div className="App">
      {/* dropdowns and tool bar */}
      <div className="ToolView">
        <button className='ToolItem'>File</button>
        <button className='ToolItem'>Edit</button>
        <button className='ToolItem'>Tools</button>
        <label className="ToolItem ToolFileItemWrapper">
          <input id="file" type="file" className='ToolFileItem' onChange={FileBoxOnChanged} title="Select file to load" />
          <span className='ToolFileItemText'>DEBUG LOAD FILE</span>
        </label>
      </div>
      {/* file view/list */}
      <div id="FilePanel" className='FileView'>
      </div>
      <hr className='FileViewSeparator'></hr>
      {/* content views */}
      <div id='contentView' className='ContentView' onWheel={ScrollDataView}>
        <div id="offsetsView" className='OffsetView'></div>
        <div id="dataView" className='DataView'></div>
      </div>
      <div className='Footer'/>
    </div>
  );
}

export default App;
/*

        <button className='ToolItem'>example1</button>
        <button className='ToolItem'>example2</button>



*/