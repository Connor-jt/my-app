import React from 'react';
import './App.css';


// ////////////////////////////////// //
// TEMP FILE LOADING FUNCTIONALITIES // ----------------------
// //////////////////////////////// //

// struct list of all open files
// id
// file
// filename
// file reader
const FileChunkSize:number = 1024;
class FileProcessor{
  file:File;
  constructor(_file:File){
    this.file = _file;


    // call first read to setup top and bottom chunks
    this.read(0, 0);
  }
  read(offset:number, count:number){
    if (count >= FileChunkSize) throw new Error("read size too large");
    // check to make sure at least some of the data falls inside
    if (offset < 0) throw new Error("byte offset below 0");
    
    // check whether the offset is out of range
    if (offset < this.lowest_offset){
      // then we need to read the previous chunk
      
      // check if the offset falls outside the range of the next block
      if (offset - this.lowest_offset){

      }
    }
    if (offset + count > this.Highest_offset){
      
    }

    // drop any overflowing indicies

  }
  prev_chunk(){

  }
  next_chunk(){

  }

  lowest_offset:number; // first byte of lower chunk
  Highest_offset:number; // last byte of upper chunk

  lower_chunk:Uint8Array;
  upper_chunk:Uint8Array;
}

function hook_filesbox(){

  var files_box = document.getElementById('file');
  if (files_box == null) throw("failed to find file input element");
  files_box!.onchange = e => { 
      if (e.target == null) throw("filbox target doesn't exist");
      var input = e.target as HTMLInputElement;
      if (input.files == null || input.files!.length == 0) {return;} // "filbox no files selected"

      var file:File = input.files![0];
      if (file == null){return;} // dont do anything when we clear the file

      
      
      


  };
}

// ///////////// //
// UI FUNCTIONS //
// /////////// //
const line_height = 18;
const offset_bytes = 4;
var total_bytes:number = NaN;
var bytes_per_row:number = NaN;

var available_size:number = 0;
var visible_rows:number = NaN;
var total_rows:number = NaN;

var last_row_index:number = NaN;
var last_row_count:number = NaN;

var rows_added_top:number = NaN; // added/removed from the top of the data view
var rows_added_bot:number = NaN; // added/removed from bottom


function update_onscreen_data(){

}
function update_data_scroll(){
  // calculate how much of the screen space we're currently viewing

}

function UpdateOffsetView(){
  // get available 
}


// ////////////// //
// CONTENT VIEWS //
// //////////// //
function DataView(){
  
}
// used to search/find values from any 
function SearchView(){

}
// used to view/edit any highlighted data from any dataview
function EditView(){

}

// wrapper window for files and content views
function ContentView(){

  // need the offset side bar
  // need the "offset" and then offset per column and "decoded text"???

}

// main app view
function App() {
  return (
    <div className="App">
      {/* dropdowns and tool bar */}
      <div className="ToolView">
        <button className='ToolItem'>File</button>
        <button className='ToolItem'>Edit</button>
        <button className='ToolItem'>Tools</button>
        <input id="file" type="file" title="Select file to load" />
      </div>
      {/* file view/list */}
      <div className='FileView'>
        <button className='ToolItem'>example1</button>
        <button className='ToolItem'>example2</button>
      </div>
      <hr className='FileViewSeparator'></hr>
      {/* content views */}
      <div className='ContentView'>
        <div className='OffsetView'>00000000</div>
      </div>
      <div className='Footer'/>
    </div>
  );
}

export default App;
