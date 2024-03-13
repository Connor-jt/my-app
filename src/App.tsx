import React, { ChangeEventHandler, FormEvent, WheelEventHandler, useRef, useState } from 'react';
import './App.css';
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
} // ---------------------------------------------------------------


// ////////////////////////////////// // ----------------------------------------------------------------------------------
// TEMP FILE LOADING FUNCTIONALITIES // 
// //////////////////////////////// // 
const FileChunkSize:number = 65536;
const line_height = 19;
var is_reading_data = false;
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
    RefreshFileView(); // call this AFTER we finish reading, so file list can properly append it
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
        if (count <= 0) 
          //throw new Error("Attempting to read outside of file bounds");
          return new Uint8Array();
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
      let upper_chunk_lowest_offset = Math.trunc((last_offset-1) / FileChunkSize) * FileChunkSize;
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
} // ------------------------------------------------------------------------------------------------------------------------


// /////////////////////////// // -----------------------------------------------------------------------
// CURRENT DATA VIEWING STUFF //
// ///////////////////////// //
// cached stuff for later use // so we dont have to regenerate all that data when we scroll up or down
var dataview_byte_spans:React.DetailedReactHTMLElement<{}, HTMLElement>[] = [];
var dataview_offset_spans:React.DetailedReactHTMLElement<{}, HTMLElement>[] = [];
var active_file:FileProcessor|undefined = undefined;
function LoadBytesView(file:FileProcessor){
  if (is_reading_data) return; // we'll just block this if it cant perform the goto
  active_file = file;
  // set UI values for row width and byte offset  
  CheckRootHooks();
  doc_byte_width!.value = active_file.bytes_per_row.toString();
  doc_byte_offset!.value = active_file.byte_offset.toString();
  DataViewGoto();
}
function DataViewDraw(){ // called whenever any of the data changes in the byte view window (IE data is scrolled)
  CheckRootHooks();
  const DataViewContainer = () => {return(<div>{dataview_byte_spans}</div>);};
  const OffsetsViewContainer = () => {return(<div>{dataview_offset_spans}</div>);};
  root_dataview_data!.render(<DataViewContainer />);
  root_dataview_offsets!.render(<OffsetsViewContainer />);
  // update scrollbar visual
  update_scroll_info();
  // update byte offset display
  doc_byte_offset!.value = active_file!.byte_offset.toString();
  is_reading_data = false; // unlock read 
}
async function DataViewGoto(target_offset:number|undefined = undefined){
  if (active_file == undefined) return;
  if (is_reading_data) return; // do not perform any UI updates if we're awaiting a previous update (maybe queue the inputs??)
  is_reading_data = true;
  // optional target offset param just gets applied onto our current offset
  if (target_offset != undefined) active_file.byte_offset = target_offset;
  // read & convert all bytes into react span elements
  let byte_spans:React.DetailedReactHTMLElement<{}, HTMLElement>[] = [];
  let offset_spans:React.DetailedReactHTMLElement<{}, HTMLElement>[] = [];
  let skipped_rows = Math.trunc(active_file.byte_offset/active_file.bytes_per_row);
  let rows_to_show = Math.min(active_file.total_rows - skipped_rows, active_file.visible_rows);
  // figure out the maths to determine if the byte offset causes there to be one less visible row
  for (let line_index = 0; line_index < rows_to_show; line_index++){
    let curr_byte_offset = active_file.byte_offset+(line_index*active_file.bytes_per_row);
    if (curr_byte_offset >= active_file.file.size) break; // bandaid fix to prevent doing extra lines that we dont account for (related to having weird byte offsets)
    let row_bytes = await active_file.read(curr_byte_offset, active_file.bytes_per_row);
    let row_text_content = Uint8ToHex(row_bytes);
    byte_spans.push(React.createElement("span", { key: curr_byte_offset, className: "DataSpan" }, row_text_content));
    offset_spans.push(React.createElement("span", { key: curr_byte_offset, className: "DataSpan" }, ToPaddedHex(active_file.byte_offset + (line_index*active_file.bytes_per_row), 8)));
  }
  // cache results for faster scrolling
  dataview_byte_spans = byte_spans;
  dataview_offset_spans = offset_spans;
  DataViewDraw();
}
async function DataViewScrollUp(){
  if (active_file == undefined) return;
  if (active_file.byte_offset == 0) return; // cant scroll any further, so skip
  
  // make sure we dont scroll to offsets below the minimum offset, or if we do then just go to the lowest possible offset
  let next_byte_offset = active_file.byte_offset-active_file.bytes_per_row;
  if (next_byte_offset < 0) {
    console.log("resetting position to 0")
    DataViewGoto(0);
    return;
  }

  if (is_reading_data) return;
  is_reading_data = true;
  
  // find new base offset
  active_file.byte_offset = next_byte_offset;
  // if the amount of visible rows is equal to the amount of rows, then pop the last one so we can make room for the new row above
  if (dataview_byte_spans.length >= active_file.visible_rows){
    dataview_byte_spans.pop();
    dataview_offset_spans.pop();
  }
  // create new react element for the top most item
  let row_bytes = await active_file.read(active_file.byte_offset, active_file.bytes_per_row);
  let row_text_content = Uint8ToHex(row_bytes);
  dataview_byte_spans.unshift(React.createElement("span", { key: active_file.byte_offset, className: "DataSpan" }, row_text_content));
  dataview_offset_spans.unshift(React.createElement("span", { key: active_file.byte_offset, className: "DataSpan" }, ToPaddedHex(active_file.byte_offset, 8)));
  DataViewDraw();
}
async function DataViewScrollDown(){
  if (active_file == undefined) return;
  if (is_reading_data) return;
  is_reading_data = true;
  
  // if the next scroll would put us past the end of the data, then dont scroll
  let next_byte_offset = active_file.byte_offset+active_file.bytes_per_row;
  if (next_byte_offset >= active_file.file.size) {is_reading_data = false; return;};
  active_file.byte_offset = next_byte_offset;
  let new_row_byte_offset = next_byte_offset + ((active_file.visible_rows-1) * active_file.bytes_per_row);

  // clear first row from the lists
  dataview_byte_spans.shift();
  dataview_offset_spans.shift();
  // if the next row to load is actually within the file size, then go ahead and load it
  if (new_row_byte_offset < active_file.file.size) {
    // create new react element for the bottom row
    let row_bytes = await active_file.read(new_row_byte_offset, active_file.bytes_per_row);
    let row_text_content = Uint8ToHex(row_bytes);
    dataview_byte_spans.push(React.createElement("span", { key: new_row_byte_offset, className: "DataSpan" }, row_text_content));
    dataview_offset_spans.push(React.createElement("span", { key: new_row_byte_offset, className: "DataSpan" }, ToPaddedHex(new_row_byte_offset, 8)));
  }
  DataViewDraw();
}
function ScrollDataView(e:React.WheelEvent<HTMLDivElement>){
  if (active_file == undefined) return;
  if (dataview_byte_spans.length == 0 || dataview_offset_spans.length == 0) throw new Error("cant scroll if no data is loaded");

  if (e.deltaY < 0)
    DataViewScrollUp();
  else if (e.deltaY > 0)
    DataViewScrollDown();
  
} // -----------------------------------------------------------------------------------------------------------------------


// /////////////////////////////// // --------------------------------------------------------------------------
// UI FILE SETTINGS CONFIGURATION //
// ///////////////////////////// //
function InputRowWidth(e:React.FormEvent<HTMLInputElement>){
  let elem = (e.target as HTMLInputElement);
  // filter out any non number characters
  
  elem.value = elem.value.replace(/\D/g,''); 
  if (active_file == undefined) return;
  
  let num = 16; // fallback value if thing is empty
  if (elem.value != "")
    num = parseInt(elem.value);
  // check to see if its not too large
  if (num > 256){
    elem.value = "256";
    num = 256;
  }
  // skip if the number isn't different than our current row byte width
  if (active_file.bytes_per_row == num) return;

  // update and refresh
  active_file.SetRowWidth(num);
  DataViewGoto();
}
function InputByteOffset(e:React.FormEvent<HTMLInputElement>){
  let elem = (e.target as HTMLInputElement);
  // filter out any non number characters
  if (elem.value == "") elem.value = "0";
  elem.value = elem.value.replace(/\D/g,''); 
  if (active_file == undefined) return;
  
  // parse
  let num = parseInt(elem.value);
  // check to see if its not out of file range
  if (num >= active_file.file.size){
    num = active_file.file.size-1;
    elem.value = num.toString();
  }

  if (active_file.byte_offset == num) return;
  DataViewGoto(num);
} // -------------------------------------------------------------------------------------------------------------


// //////////// // --------------------------------------------------------------------------------------------
// GLOBAL DATA //
// ////////// //
var open_files:FileProcessor[] = [];
var active_files:FileProcessor[] = []; // only modified when calling the refresh function
// ------------------------------------------------------------------------------------------------------------

// /////////////////// // --------------------------------------------------------------------------
// FILE OPENING STUFF //
// ///////////////// // 
var has_created_roots = false;
var root_fileview_files:Root|undefined = undefined;
var root_dataview_data:Root|undefined = undefined;
var root_dataview_offsets:Root|undefined = undefined;
// some extra stuff that we should totally cache
var doc_scroll_thumb:HTMLDivElement|undefined = undefined;
var doc_content_view:HTMLDivElement|undefined = undefined;
var doc_byte_width:HTMLInputElement|undefined = undefined;
var doc_byte_offset:HTMLInputElement|undefined = undefined;
function CheckRootHooks(){ // theres probably a way to do this after the document loads, but this is the best i can think of for now
  if (has_created_roots) return;
  root_fileview_files   = createRoot(document.getElementById('FilePanel')!);
  root_dataview_data    = createRoot(document.getElementById('dataView')!);
  root_dataview_offsets = createRoot(document.getElementById('offsetsView')!);
  // extra loading stuff
  doc_scroll_thumb = document.getElementById("scrollThumb") as HTMLDivElement;
  doc_content_view = document.getElementById('contentView') as HTMLDivElement;
  doc_byte_width = document.getElementById("byteWidth") as HTMLInputElement;
  doc_byte_offset = document.getElementById("byteOffset") as HTMLInputElement;
  has_created_roots = true;
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
  CheckRootHooks(); // do init, i think this is the only place this actually needs to be called??
  opened_file.RefreshSize(doc_content_view!.clientHeight);
  open_files.push(opened_file);
};
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
  LoadBytesView(active_files[index])
} // -------------------------------------------------------------------------------------------------


// /////////////////////// //--------------------------------------------------------------
// UPDATE SCROLLBAR THING //
// ///////////////////// //
function update_scroll_info(){
  if (active_file == undefined) return;
  // do we also update the value of that scroll position thing??

  
  let bytes_skipped_upper = active_file.byte_offset;
  // calculate how many bytes are currently visible
  let bytes_visible = active_file.bytes_per_row * active_file.visible_rows;
  // calculate how many bytes are not visible at the end
  let bytes_skipped_lower = active_file.file.size - (bytes_skipped_upper + bytes_visible)

  let top_percentage = 1.0 - ((active_file.file.size - bytes_skipped_upper) / active_file.file.size);
  let bottom_percentage = 1.0 - Math.min((active_file.file.size - bytes_skipped_lower) / active_file.file.size, 1.0); // cap out at 100

  // then we need to ensure the bottom and top are a minimum distance from another (theres a problem where the bar hardly moves when focused at the first or last 15 percent of data)
  let scrollbar_height = 1.0 - (top_percentage + bottom_percentage);
  const minimum_scrollbar_height = 0.05;
  let min_expanded_on_each_side = (minimum_scrollbar_height/2) - (scrollbar_height/2);
  if (scrollbar_height < minimum_scrollbar_height){
    if (top_percentage < min_expanded_on_each_side){
      bottom_percentage -= (minimum_scrollbar_height) - (top_percentage + scrollbar_height);
      top_percentage = 0; 
    }
    else if (bottom_percentage < min_expanded_on_each_side){
      top_percentage -= (minimum_scrollbar_height) - (bottom_percentage + scrollbar_height);
      bottom_percentage = 0; 
    } else {
      top_percentage -= min_expanded_on_each_side;
      bottom_percentage -= min_expanded_on_each_side;
    }
  }

  update_scroll_size(top_percentage*100, bottom_percentage*100);
}
function update_scroll_size(new_top:number, new_bot:number){
  CheckRootHooks();
  doc_scroll_thumb!.style.top = new_top.toString() + "%";
  doc_scroll_thumb!.style.bottom = new_bot.toString() + "%";
}// ------------------------------------------------------------------------------------------

// ////////////////// // ---------------------------------------------------------------------
// ON WIDNOW RESIZED //
// //////////////// //
var has_user_finished_resizing = false;
var resize_waiter:NodeJS.Timer|undefined;
function window_resized(){
  if (resize_waiter != undefined) {
    has_user_finished_resizing = false;
    return;}
  has_user_finished_resizing = true;
  // and just give it a shot every second or so before redoing all the UI
  resize_waiter = setInterval(resize_pending, 500);
}
function resize_pending(){
  // if window was called while this was in timeout, then restart wait
  if (has_user_finished_resizing == false){
    has_user_finished_resizing = true;
    return;}
  // otherwise we're clear to complete the resizing
  for (let i = 0; i < active_files.length; i++){
    let curr_file = active_files[i];
    curr_file.RefreshSize(doc_content_view!.clientHeight);
  }
  DataViewGoto(); // and then apply updates visually
  has_user_finished_resizing = false
  clearInterval(resize_waiter);
  resize_waiter = undefined;
}
// -------------------------------------------------------------------------------------------


// //////////// // --------------------------------------------------------------------------
// APP UI JUNK //
// ////////// //
function App() {
  window.addEventListener('resize', window_resized, true);
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
        
        <span className='ToolText'>Row Width:</span>
        <input id="byteWidth" className='ToolInput' type="text" onInput={InputRowWidth}></input>
        <span className='ToolText'>Offset:</span>
        <input id="byteOffset" className='ToolInput' type="text" onInput={InputByteOffset}></input>
      </div>
      {/* file view/list */}
      <div id="FilePanel" className='FileView'>
      </div>
      <hr className='FileViewSeparator'></hr>
      {/* content views */}
      <div id='contentView' className='ContentView' onWheel={ScrollDataView}>
        <div id="offsetsView" className='OffsetView'></div>
        <div className='DataWrapper'>
          <div id="dataView" className='DataView'></div>
        </div>
        <div className='ScrollView'>
          <div id="scrollThumb" className='ScrollThumb' >
          </div>
        </div>
      </div>
      <div className='Footer'/>
    </div>
  );
}
export default App;
// ------------------------------------------------------------------------------------------

