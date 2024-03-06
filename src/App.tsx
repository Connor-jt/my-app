import React from 'react';
import './App.css';

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
function FileView(){

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
      </div>
      {/* file view/list */}
      {/* content views */}
      <div className='ContentView'/>
    </div>
  );
}

export default App;
